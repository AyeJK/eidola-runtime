# Cursor Soul Bridge Spec

_Canonical reference for Soul compile + workspace binding · Last updated: 2026-06-12_

The Cursor Soul bridge connects portable Engram Soul prose to Cursor's always-on rule system. **SOUL.md stays canonical** — the compiled `.mdc` rule is a generated artifact, never hand-edited.

---

## Dual-layer model

```
Identity layer   SOUL.md  →  compile  →  .cursor/rules/{id}.mdc  (always on)
Runtime layer    engram.yaml + vessel.yaml  →  load_eidolon / auto-activate  →  Shrine Vessel
```

| Layer | Source | Cursor delivery | Purpose |
|-------|--------|-----------------|---------|
| **Identity** | `SOUL.md` | Compiled `.mdc` rule | Persona voice, tone, rules — persists across chats |
| **Runtime** | `engram.yaml`, `vessel.yaml` | MCP `load_eidolon` / auto-activation | Vessel pack binding, expression map, reinject fallback |

**One workspace per Engram.** Each Cursor workspace gets a single `alwaysApply: true` Soul rule. Multi-Engram switching within one workspace is out of scope.

---

## Compile pipeline

Shared utility: `compileSoulToCursorRule()` in `packages/cli/src/cursor/`.

**Inputs:**
- `SOUL.md` — pure soul.md prose, no frontmatter
- `engram.yaml` — `id` and `name` for rule filename and description

**Output:** Full `.mdc` file content (frontmatter + verbatim Soul body).

**Rules:**
1. Soul body is **byte-for-byte** the normalized SOUL.md content (LF line endings).
2. No YAML, engram metadata, or vessel config appears in the rule body.
3. Frontmatter is machine-generated only — Shapers regenerate via `pnpm link-engram` or Forge export (Phase 3).
4. Rule filename: `{engram-id}.mdc` under `.cursor/rules/`.

---

## `.mdc` frontmatter schema

Cursor rule format — YAML frontmatter delimited by `---`:

```yaml
---
alwaysApply: true
description: "Example Engram"
---
```

| Field | Required | Value |
|-------|----------|-------|
| `alwaysApply` | yes | `true` — Soul persists across all chats in the workspace |
| `description` | yes | `engram.yaml` `name` field — shown in Cursor rule UI |

Everything after the closing `---` is SOUL.md verbatim.

**Not used in Phase 1.2:** `globs`, `agent-requestable`, or other scoped rule modes.

---

## Workspace config — `.cursor/eidola.json`

Written by `pnpm link-engram`. Read by MCP on startup (Sprint 1.2.2) for auto vessel activation.

```json
{
  "active_engram_id": "example-engram",
  "engrams_dir": "C:/path/to/workspace/engrams",
  "soul_hash": "a1b2c3...",
  "compiled_at": "2026-06-12T10:00:00.000Z"
}
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `active_engram_id` | yes | string | Engram slug — matches directory name and rule filename |
| `engrams_dir` | no | string | Override for Engram root. Default: `{EIDOLA_ROOT}/engrams` |
| `soul_hash` | yes | string | SHA-256 hex of normalized SOUL.md at last compile |
| `compiled_at` | yes | string | ISO-8601 timestamp of last successful compile |
| `shrine_surface` | no | string | Shrine display preset (`ultrawide-4-1`, `square-1-1`, `widescreen-16-9`) or custom `WxH`. Default `ultrawide-4-1` |

**Resolution order for `engrams_dir`:**
1. Value in `eidola.json` (if present)
2. `EIDOLA_ENGRAMS_DIR` env var
3. `{EIDOLA_ROOT}/engrams` (default)

---

## Shaper workflow — `pnpm link-engram`

Run from the **Cursor workspace root** (where `.cursor/` lives):

```bash
pnpm link-engram example-engram
```

**Steps performed:**
1. Resolve Engram directory from `engrams_dir` / env / default
2. Validate Engram loads (`SOUL.md`, `vessel.yaml`, `engram.yaml`)
3. Compile Soul → `.cursor/rules/{id}.mdc`
4. Write `.cursor/eidola.json` with content hash
5. Log paths to stdout

**Regeneration:** Re-run after any SOUL.md edit. The compiled rule is never the source of truth.

---

## Launch Shrine from chat

The Shrine does **not** open automatically. Shapers launch it explicitly:

| Method | When |
|--------|------|
| **MCP `launch_shrine`** | Ask the agent in chat — e.g. "Launch the shrine" |
| **`pnpm ensure:shrine`** | Terminal fallback (same launcher) |

Surface preset: `shrine_surface` in `eidola.json`, or `EIDOLA_SHRINE_SURFACE` / `EIDOLA_SHRINE_WIDTH` + `EIDOLA_SHRINE_HEIGHT`. Monitor index: `EIDOLA_SHRINE_DISPLAY`.

Idempotent — returns `already_running` if the window is open. Requires built Shrine (`pnpm build` in `eidola-runtime`).

---

## Stale-rule detection

When SOUL.md changes after compile, the workspace rule drifts from the Engram source.

**Detection:** Compare SHA-256 hash of current SOUL.md against `soul_hash` in `eidola.json`, or against the compiled `.mdc` body.

**Behavior:** `warnIfStaleSoulCompile()` writes a warning to **stderr only** — no modal, no MCP startup block:

```
[eidola] Stale Cursor rule: SOUL.md changed since last compile (hash mismatch). Re-run: pnpm link-engram example-engram
```

**Call sites:**
- `link-engram` script (post-write sanity check)
- MCP server startup (Sprint 1.2.2)

---

## `load_eidolon` role (narrowed)

In Cursor with a linked workspace:

| Concern | Primary path | Fallback |
|---------|--------------|----------|
| Personality | Compiled `.mdc` rule | MCP Soul `<system-reminder>` injection |
| Vessel | MCP auto-activation / `load_eidolon` | Manual `load_eidolon` chat step |

`load_eidolon` always binds the Vessel pack and broadcasts idle. Soul injection runs only when no matching Cursor rule is detected (Sprint 1.2.2).

---

## Forge export (Phase 3)

The Forge **Install as Cursor rule (always on)** toggle will call the same `compileSoulToCursorRule()` utility. Export package checklist includes generated `.mdc` + `eidola.json` template. Implementation deferred to Phase 3; compile util ships in Sprint 1.2.1.

---

## Related specs

- Engram format: [`engram-format.md`](./engram-format.md)
