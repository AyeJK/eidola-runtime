# Vessel Transitions

How the Shrine display moves between Vessel clips as your Engram's state changes.

## Why this exists

Your Vessel's state can change quickly — a fast tool call might come and go in well under a second. Without smoothing, that would mean jarring hard cuts between clips, or flickering between expressions faster than you could actually see them. Shrine avoids both with two mechanisms: a minimum hold time, and a crossfade.

## Minimum hold

Once a clip starts playing, it stays on screen for at least the minimum hold time before switching to the next state — even if your Engram's state changes again in the meantime. If several state changes arrive in quick succession, only the most recent one plays once the hold expires; the others are skipped rather than queued up to play out one after another.

Default: **1000ms**.

## Crossfade

When the Vessel does swap clips, it blends from the outgoing clip into the incoming one rather than cutting instantly, so the transition reads as intentional regardless of where in the clip the swap happens.

Default: **300ms**.

## Per-Engram overrides

An Engram can set its own values in `vessel.yaml`:

```yaml
playback:
  min_hold_ms: 1000
transitions:
  duration_ms: 300
```

Omitting either falls back to the defaults above. See [`engram-format.md`](./engram-format.md) for the full `vessel.yaml` reference.

Keep `duration_ms` well under `min_hold_ms` — the crossfade is the transition *between* hold windows, not a replacement for one. If the crossfade duration approaches or exceeds the hold time, transitions will overlap and never fully settle.
