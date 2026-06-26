# Animation Crossfade & Min-Hold Tuning

How the Shrine renderer smooths transitions between Vessel clips of wildly varying length (sub-1s to 10+s, since upload only enforces a 5MB size cap, not a duration limit).

---

## Problem

Visual state changes are event-driven (hook → socket → `resolveVisualState`), not animation-driven. Two failure modes without smoothing:

1. **Hard cuts** — swapping clips mid-frame looks jarring, especially noticeable on long clips interrupted seconds into playback.
2. **Flicker** — fast tool sequences (e.g. `PreToolUse` → `PostToolUse` on a quick `Read`) can flip the visual tier back to `thinking` faster than a clip can register as its own beat.

The goal is **smooth and fun**, not strict 1:1 accuracy between hook state and displayed animation — see [state-socket-protocol.md](state-socket-protocol.md) for the state machine these visuals are decoupled from.

---

## Mechanism

Both fixes live in `VesselPlayer` ([packages/shrine/src/renderer/vessel-player.ts](../../eidola-repo/packages/shrine/src/renderer/vessel-player.ts)), independent of hook/state logic.

### Min-hold

`play()` tracks `currentStateStartedAt`. If a new state arrives before `minHoldMs` has elapsed on the current one, the incoming payload is stashed in `pendingPlay` and a single `setTimeout` fires the swap once the hold expires:

```
elapsed = now - currentStateStartedAt
if elapsed < minHoldMs:
    queue pendingPlay, schedule swap for (minHoldMs - elapsed)
```

Rapid-fire states collapse onto the *last* one queued — no animation backlog plays out sequentially — **except** for one priority rule added in Phase 5.3 Sprint 5.3.1: if the already-queued `pendingPlay` payload's visual tier is tool-aware (`searching`/`writing`/`working`, see `TOOL_AWARE_STATES` in `@eidola/tool-state`) and the incoming payload's visual tier is `'thinking'`, the incoming payload is dropped instead of overwriting it. This exists because `PostToolUse`/`postToolUse` maps to `'thinking'` and fires almost immediately after a fast tool's `PreToolUse`-driven `searching`/`working` state — without the guard, a fast `Read`/`Grep` call's busy state could be queued into `pendingPlay` and then silently erased by the following `'thinking'` broadcast before the hold ever expired and the busy frame rendered at all. Every other overwrite case is unchanged last-write-wins: a newer tool-aware payload still replaces an older pending one (most recent tool signal wins, not first), and a pending `'thinking'` is still replaced by an incoming `error`/`success`/`idle`/`attention` payload. The guard lives in `VesselPlayer.setPendingPlay()`, called from both stash sites (the `isPlaying` early-return and the min-hold branch).

### Crossfade

Two stacked layers (`layerA` / `layerB`) ping-pong as active/incoming on every clip swap. `crossfade()` ramps `incoming` opacity 0→1 and `outgoing` opacity 1→0 over `crossfadeMs` via `requestAnimationFrame`. This applies uniformly to lottie, webm, and gif playback (`playLottieClip` / `playWebMClip` / `playGifClip` all route through the same `crossfade()` call) — the outgoing clip is cut at whatever frame it's on, but the blend makes the cut read as intentional regardless of clip length or interruption point.

---

## Current values

| Setting | Value | Source of truth |
|---|---|---|
| `minHoldMs` | **1000ms** | engram default in [parse.ts](../../eidola-repo/packages/mcp/src/engram/parse.ts) (`min_hold_ms` field), propagated through [types.ts](../../eidola-repo/packages/shrine/src/shared/types.ts) `vesselConfigFromYaml`, renderer pre-config default in [main.ts](../../eidola-repo/packages/shrine/src/renderer/main.ts) `DEFAULT_CONFIG`, and `VesselPlayer`'s initial field |
| `crossfadeMs` | 300ms | `vessel.transitions.duration_ms` in an Engram's `vessel.yaml`, same propagation path |

Per-Engram overrides: author a `playback.min_hold_ms` (and `transitions.duration_ms`) in `vessel.yaml` — see [engram-format.md](engram-format.md). Omitting either falls back to the defaults above.

---

## Tuning notes

- Raising `minHoldMs` trades a small amount of state/display lag for readability — acceptable since accuracy isn't the goal. 1000ms was chosen after observing `thinking` dominating display time during busy sessions (many fast tool calls produce visual flickers shorter than a viewer can register).
- `crossfadeMs` should stay well under `minHoldMs` — it's the transition *between* hold windows, not a substitute for one. If `crossfadeMs` approaches or exceeds `minHoldMs`, holds will overlap and never fully settle.
- Neither setting compensates for clip *content* length — a 10s clip interrupted at 1s still only plays 1s of it. Crossfade hides the cut; it doesn't extend playback.
- **What Sprint 5.3.1's `pendingPlay` priority rule does *not* fix:** it only stops a queued tool-aware payload from being erased before it renders — it does not change how long `'thinking'` versus `'working'`-cluster states get to display once they *do* render. A turn with one tool call still spends most of its wall-clock time on `'thinking'` if the post-tool gap is long; that balance is Sprint 5.3.2's grace-period mechanism (`'thinking'` immediately after a tool displays as `'waiting'` first, only flipping to genuine `'thinking'` after a few seconds of nothing else happening). It also does not address parallel tool calls — if two tools run concurrently and the first one's `PostToolUse` fires `'thinking'` while a sibling tool is still executing, nothing here stops that `'thinking'` from going out as the *current* (non-pending) state; that correctness gap is closed by Sprint 5.3.3's in-flight tool counter. Treat 5.3.1 as "a queued busy frame won't be thrown away," not "thinking/working time is now balanced" or "parallel tool races are now handled."

---

## References

- [state-socket-protocol.md](state-socket-protocol.md) — hook → semantic state → visual tier pipeline these visuals consume
- [engram-format.md](engram-format.md) — `vessel.yaml` `playback` / `transitions` fields
- [vessel-lottie-spec.md](vessel-lottie-spec.md) — clip authoring constraints (size, fps, loop behavior)
