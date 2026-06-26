# State Socket Protocol

_Schema version: `1.0` · Last updated: 2026-06-11_

Single local TCP socket carries newline-delimited JSON between producers (Cursor extension, Claude Code hooks, Chrome extension), the MCP server, and the overlay.

**Transport:** TCP on `127.0.0.1` only — never bind a public interface.  
**Framing:** One JSON object per line (NDJSON). UTF-8.

Default port: `9742` (`EIDOLA_STATE_SOCKET_PORT` override).

---

## Inbound event (producer → MCP server)

Written by extensions and hooks when AI activity changes.

```json
{
  "protocol_version": "1.0",
  "ts": 1749600000000,
  "surface": "cursor",
  "state": "thinking",
  "tool": "Grep",
  "metadata": {}
}
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `protocol_version` | yes | string | Protocol semver. Current: `"1.0"`. Mismatch → warning + idle fallback. |
| `ts` | yes | number | Unix epoch milliseconds. |
| `surface` | yes | string | One of: `cursor`, `claude-code`, `claude-chat`, `cowork`, `manual`. |
| `state` | yes | string | Vessel state name. Legacy aliases (`completed`, `confused`, `alerting`) accepted on inbound socket and normalized to canonical names (`success`, `error`, `attention`). Unknown values → `idle`. |
| `tool` | no | string | Raw tool name from hook/LM event (e.g. `Grep`, `Bash`). |
| `metadata` | no | object | Arbitrary key-value pairs. `tools_in_flight` (number) is the one field the MCP server acts on (see below); all other keys are currently ignored. |

### `metadata.tools_in_flight`

Count of tools still executing for the producing surface's current turn, attached by `claude-hooks` on `PostToolUse`/`SubagentStop`/`PostToolUseFailure` and by `cursor-hooks` on `postToolUse`/`subagentStop` — the just-decremented in-flight counter, after the finishing tool's own decrement. Introduced in Phase 5.3.3 to fix a parallel-tool race: when two or more tools run concurrently, the first to finish maps to `'thinking'`, but a sibling tool may still be executing.

When an inbound event's resolved visual tier would be `'thinking'` and `metadata.tools_in_flight > 0`, the MCP server suppresses the fall-through entirely and holds the broadcast's visual tier at whatever busy tier (`working`/`searching`/`writing`, or `waiting` per the Sprint 5.3.2 grace override) was last active, instead of arming the grace timer or emitting `waiting`/`thinking`. Once `tools_in_flight` reaches `0` (or is absent), behavior is unchanged from before Sprint 5.3.3.

### Example — Cursor model stream start

```json
{"protocol_version":"1.0","ts":1749600000000,"surface":"cursor","state":"thinking","metadata":{}}
```

---

## Broadcast (MCP server → all connected clients)

Emitted after inbound events are normalized and mapped through the active Engram's `vessel.yaml`. Also emitted when `set_expression` MCP tool is called (`surface: "manual"`).

```json
{
  "protocol_version": "1.0",
  "ts": 1749600000000,
  "state": "thinking",
  "engram_id": "camina-drummer",
  "expression": "thinking.json"
}
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `protocol_version` | yes | string | Always `"1.0"` for current runtime. |
| `ts` | yes | number | Server timestamp when broadcast was produced. |
| `state` | yes | string | Normalized semantic state (unknown inbound → `idle`). |
| `engram_id` | yes | string | Active Engram id, or `""` when none loaded. |
| `expression` | yes | string | Clip filename resolved from **visual tier** (`visual_state` when present, else `state`), with working-cluster fallback to `working.json`. |
| `visual_state` | no | string | Visual tier for renderer playback when it differs from semantic `state` (e.g. semantic `searching` → visual `working`). Omitted when tier matches `state`. |
| `tool` | no | string | Raw tool name when present on inbound event. |

### Example — mapped searching state

```json
{
  "protocol_version": "1.0",
  "ts": 1749600000000,
  "state": "searching",
  "visual_state": "working",
  "engram_id": "camina-drummer",
  "expression": "working.json",
  "tool": "Grep"
}
```

---

## Server behavior

| Rule | Behavior |
|------|----------|
| Bind address | `127.0.0.1` only |
| Overlay reconnect | Replay last N broadcasts (default 32) immediately on connect, then live stream |
| Unknown `state` | Normalize to `idle`; use idle clip; no throw |
| `protocol_version` mismatch | Log warning; normalize to `idle` |
| No active Engram | Broadcast with `engram_id: ""`, `expression: "idle.json"` |
| Missing expression clip | Fall back to `vessel.expressions.idle`, then `"idle.json"` |
| Producer disconnect | Silent; no retry |
| `responding` inbound event | Triggers `SessionState.recordAssistantTurn()` for Soul reinject counting |

---

## Defined Vessel states (Phase 1.4)

| State | Source |
|-------|--------|
| `idle` | Default, stop aborted, unknown state |
| `thinking` | Cursor model stream start; between tools |
| `waiting` | Tool-adjacent grace period — between tool calls, before genuine thinking is confirmed — standardized across both surfaces in Phase 5.3 |
| `responding` | Plain-text reply (no tools this turn) |
| `success` | Turn finished successfully |
| `error` | Error events |
| `working` | Tool activity — Bash, shell, MCP |
| `searching` | Tool activity — Read / Grep / Glob |
| `writing` | Tool activity — Write / Edit |
| `attention` | Notification; permission denied; approval gate (shell/MCP execution) — standardized across Cursor and Claude Code in Phase 5.3 |

**Legacy inbound aliases:** `completed` → `success`, `confused` → `error`, `alerting` → `attention`. Broadcasts always use canonical names.

Busy states loop in the overlay during hook silence. Unknown inbound states normalize to `idle`.

---

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `EIDOLA_STATE_SOCKET_PORT` | `9742` | TCP port (localhost only) |
| `EIDOLA_STATE_BUFFER_SIZE` | `32` | Broadcast replay buffer length |
