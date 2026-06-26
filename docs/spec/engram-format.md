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
| **1–2** | **Lottie + component (Three.js)** | — | MCP → Shrine loop. A component pack (e.g. a registered `*-threejs` renderer) can be used with Lottie fallback. |
| **3** | **Lottie + WebM + component** | Lottie + WebM import **or** component pack selection | WebM playback and clip import ship together. Forge selects registered Three.js packs — no custom shader authoring. |
| **8** | Lottie + WebM + component | + AI-generated WebM | Bookended WebM pipeline builds on Phase 3 clip path. Component packs unchanged. |

`vessel.yaml` `type` field declares the pack format: `"lottie"`, `"webm"`, or `"component"`. Shrine refuses to load a pack whose `type` exceeds current runtime support (e.g. WebM pack on Phase 1 Shrine → fall back to idle, log only).

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
| `type` | yes | `"lottie"` \| `"webm"` \| `"component"` | Clip format or component renderer. `"lottie"` in Phase 1–2; `"webm"` from Phase 3; `"component"` for Three.js packs (states managed inside the pack). |
| `pack` | yes | string | Vessel pack id → `vessels/{pack}/`. For `component`, resolves to a registered renderer module, not clip files. |
| `expressions` | yes* | object | Maps state name → clip filename (`.json` for Lottie, `.webm` for WebM). *Omitted for `type: component` — expressions are internal to the pack. |
| `fallback` | no | object | **Component type only.** Lottie or WebM pack used when Shrine cannot mount the component renderer. Same shape as a clip-type vessel block. |
| `transitions.default` | no | `"crossfade"` \| `"cut"` | Default transition between clips. Default: `crossfade`. |
| `transitions.duration_ms` | no | number | Crossfade duration. Default: `300`. |
| `playback.idle_loops` | no | boolean | Loop idle clip. Default: `true`. |
| `playback.approval_idle_ms` | no | number | Mid-turn approval idle timer (ms). Overlay-only; used when gated-tool hooks go silent. Default: `3000`. |

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

**HUD (Camina V3 / component packs):** Primary label from visual tier (`WORKING`, `THINKING`, …). Sub-label from `tool` when present (`Grep`, `Write`, `Shell`); otherwise semantic name when in the working cluster (e.g. `thinking` after `postToolUse`).

**Clip resolution:** `resolveExpressionClip` maps working-cluster semantics to the `working` clip when no per-state clip exists. `searching` / `writing` clips are optional — they may alias to `working`.

**Forge required clips (Phase 3.1):** `idle`, `thinking`, `working`, `responding`. Optional: `searching`, `writing` (alias to working), `error`, `attention`.

### Deprecated expression keys

| Key | Status |
|-----|--------|
| `working_loop` | Deprecated — was overlay dead-air fallback. Clip may remain in legacy packs until repurposed or removed. Not a socket state. |

### Missing clip fallback

If any expression file is missing, overlay plays `idle` and logs. No visible error.

### `type: component` (Three.js packs)

Component vessels delegate expression state to a registered renderer module under `vessels/{pack}/`. Shrine and MCP resolve `pack` to the pack id and mount the renderer — **no per-state clip files** in the Engram directory.

| Field | Required | Notes |
|-------|----------|-------|
| `type` | yes | Must be `"component"`. |
| `pack` | yes | Registered component pack id → renderer module in `vessels/{pack}/`. |
| `expressions` | no | Omitted — state → pose mapping lives inside the pack. |
| `states` | no | Informational list of states the pack supports; used by Forge preview and docs. |
| `playback` | no | Same keys as clip types where applicable (`idle_loops`, `approval_idle_ms`). |
| `fallback` | no | Clip-type block (`type: lottie` or `type: webm`) used when Shrine cannot mount WebGL. Same shape as a standalone clip vessel ( `pack`, `expressions`, `transitions`, `playback` ). |

**Forge authoring (Phase 3):** Shapers pick a registered pack in The Forge; optional fallback maps Lottie or WebM clips for hosts without Three.js. Export sets `type`, `pack`, `states`, `playback`, and optionally `fallback` on `vessel.yaml`.

**Runtime:** Shrine tries component renderer first; on mount failure, plays `fallback` clips with the same silent missing-clip rules as Lottie/WebM packs.

---

## Cursor bridge

When an Engram is linked to a Cursor workspace, Soul delivery shifts from MCP injection to a compiled always-on rule.

| Concern | Cursor (linked workspace) | Other hosts |
|---------|----------------------------|-------------|
| Soul source | `SOUL.md` (canonical) | `SOUL.md` (canonical) |
| Delivery | `.cursor/rules/{id}.mdc` via `pnpm link-engram` | MCP `<system-reminder>` via `load_eidolon` |
| Vessel | MCP auto-activation / `load_eidolon` | MCP `load_eidolon` |

**Workflow:** Shaper runs `pnpm link-engram {id}` from workspace root. Writes `.cursor/rules/{id}.mdc` and `.cursor/eidola.json`. Re-run after SOUL.md edits.

**Stale detection:** SHA-256 hash of SOUL.md stored in `eidola.json` `soul_hash`. MCP warns on stderr when hash mismatches — does not block startup.

Canonical reference: [`cursor-soul-bridge.md`](./cursor-soul-bridge.md).
