# Engram Format Spec

_Last updated: 2026-06-24_

An Engram is a directory containing three files.

```
engrams/{id}/
  SOUL.md
  vessel.yaml
  engram.yaml
```

Vessel clips live in a separate pack directory:

```
vessels/{pack}/
  idle.json       # Lottie (Phase 1–2)
  thinking.json
  ...
```

`vessel.yaml` `pack` field resolves to `vessels/{pack}/`. Expression values are filenames relative to that directory.

---

## Vessel format by phase

| Phase | Shrine playback | Forge authoring | Notes |
|-------|-----------------|-----------------|-------|
| **1–2** | **Lottie** | — | MCP → Shrine loop. |
| **3** | **Lottie + WebM** | Lottie + WebM import | WebM playback and clip import ship together. |
| **8** | Lottie + WebM | + AI-generated WebM | Bookended WebM pipeline builds on Phase 3 clip path. |

`vessel.yaml` `type` field declares the pack format: `"lottie"`, `"webm"`, `"mp4"`, or `"gif"`. Shrine refuses to load a pack whose `type` exceeds current runtime support (e.g. WebM pack on Phase 1 Shrine → fall back to idle, log only).

---

## engram.yaml

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `engram_version` | yes | string | Shaper-facing edit-history semver. New Engrams start at `1.0.0`; the Forge bumps it on save. Must be well-formed semver, but the runtime does not gate loading on its value — it has no bearing on engram.yaml schema compatibility. |
| `id` | yes | string | Slug. Matches directory name. |
| `name` | yes | string | Display name. |
| `voice_id` | yes | string \| null | Reserved for Phase 4+. `null` in Phase 1–3. |
| `meta.author` | yes | string | Shaper or creator handle. |
| `meta.created` | yes | string | ISO date (`YYYY-MM-DD`). |
| `meta.description` | no | string | Short summary for directory browse cards and detail pages. |
| `meta.tags` | no | string[] | Browse/filter tags. |
| `extensions` | yes | object | Shaper namespace. Preserved verbatim across migrations; never migrated by Eidola. |

---

## vessel.yaml

Unversioned. Parsed by MCP server and overlay.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `type` | yes | `"lottie"` \| `"webm"` \| `"mp4"` \| `"gif"` | Clip format. `"lottie"` in Phase 1–2; `"webm"`/`"mp4"`/`"gif"` from Phase 3. |
| `pack` | yes | string | Vessel pack id → `vessels/{pack}/`. |
| `expressions` | yes | object | Maps state name → clip filename (`.json` for Lottie, `.webm`/`.mp4`/`.gif` otherwise). |
| `transitions.default` | no | `"crossfade"` \| `"cut"` | Default transition between clips. Default: `crossfade`. |
| `transitions.duration_ms` | no | number | Crossfade duration. Default: `300`. |
| `playback.idle_loops` | no | boolean | Loop idle clip. Default: `true`. |
| `playback.approval_idle_ms` | no | number | Mid-turn approval idle timer (ms). Overlay-only; used when gated-tool hooks go silent. Default: `3000`. |
| `playback.success_hold_ms` | no | number | How long the overlay holds `success` before returning to idle. Overlay-only. Default: `3000`. |
| `playback.min_hold_ms` | no | number | Minimum time a visual state must remain on screen before the next can play (see [animation-crossfade-tuning.md](./animation-crossfade-tuning.md)). Overlay-only. Default: `1000`. |

### Expression states

| State | Phase | Socket / trigger source |
|-------|-------|-------------------------|
| `idle` | 1 | Default, `Stop` aborted, unknown state |
| `thinking` | 1 | Cursor model stream start; between tools |
| `waiting` | 1.4 | Mid-turn approval gate (shell / MCP) |
| `responding` | 1 | Plain-text reply (no tools this turn) |
| `success` | 1.4 | Turn finished successfully (`stop` + success) |
| `error` | 1 | Cursor error event |
| `working` | 2 | Tool activity — Bash, shell, MCP |
| `searching` | 2 | Tool activity — Read / Grep / Glob |
| `writing` | 2 | Tool activity — Write / Edit |
| `attention` | 2 | Claude Code `Notification`; permission denied |

Busy states (`thinking`, `working`, `searching`, `writing`) loop in the overlay during hook silence — no timer escalation.

### Visual tiers vs semantic states (Phase 3.1)

Runtime distinguishes **semantic state** (fine-grained hook output on the wire) from **visual tier** (what the renderer plays). Semantic states are unchanged on the socket; Shrine and clip resolution collapse the post-tool busy cluster into visual `working` after the first tool-aware hook in a turn.

| Semantic state | `firstToolStarted` | Visual tier |
|----------------|-------------------|-------------|
| `thinking` | `false` | `thinking` |
| `thinking`, `searching`, `writing`, `working` | `true` | `working` |
| `waiting`, `responding`, `success`, `idle`, `error`, `attention` | any | same as semantic |

**Socket broadcast:** `state` remains semantic. Optional additive field `visual_state` carries the visual tier when it differs (see [`state-socket-protocol.md`](./state-socket-protocol.md)).

**HUD:** State word from visual tier (`IDLE`, `WORKING`, `THINKING`, …), a rotating flavor-phrase subtitle per tier (`pickShrineHudSubtitle`, e.g. `idle` → "still here"), and a separate tool-name badge (`toolHudLabel`, e.g. `Grep` → "grepping") shown only when `tool` is present on the broadcast.

**Clip resolution:** `resolveExpressionClip` maps working-cluster semantics to the `working` clip when no per-state clip exists. `searching` / `writing` clips are optional — they may alias to `working`.

**Forge required clips (Phase 3.1):** `idle`, `thinking`, `working`, `responding`. Optional: `searching`, `writing` (alias to working), `error`, `attention`.

### Deprecated expression keys

| Key | Status |
|-----|--------|
| `working_loop` | Deprecated — was overlay dead-air fallback. Clip may remain in legacy packs until repurposed or removed. Not a socket state. |

### Missing clip fallback

If any expression file is missing, overlay plays `idle` and logs. No visible error.

---

## Cursor bridge

When an Engram is linked to a Cursor workspace, Soul delivery shifts from MCP injection to a compiled always-on rule.

| Concern | Cursor (linked workspace) | Other hosts |
|---------|----------------------------|-------------|
| Soul source | `SOUL.md` (canonical) | `SOUL.md` (canonical) |
| Delivery | `.cursor/rules/{id}.mdc` via `eidola link-engram` | MCP `<system-reminder>` via `awaken` |
| Vessel | MCP auto-activation / `awaken` | MCP `awaken` |

**Workflow:** Shaper runs `eidola link-engram {id}` from workspace root. Writes `.cursor/rules/{id}.mdc` and `.cursor/eidola.json`. Re-run after SOUL.md edits.

**Stale detection:** SHA-256 hash of SOUL.md stored in `eidola.json` `soul_hash`. MCP warns on stderr when hash mismatches — does not block startup.

Canonical reference: [`cursor-soul-bridge.md`](./cursor-soul-bridge.md).
