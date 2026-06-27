# Engram Format Spec

_Last updated: 2026-06-24_

An Engram is a folder bundle: the Engram's three core files, plus its Vessel clips alongside, ready to install or share as-is. This is exactly what you get from a Forge export or a Directory download — unzip it and you have a complete, installable Engram:

```
{id}/                # e.g. ponytail-engram/
  SOUL.md
  vessel.yaml
  engram.yaml
vessels/{pack}/
  idle.json           # e.g. Lottie
  thinking.json
  ...
.cursor/
  rules/{id}.mdc      # compiled Cursor rule
```

`vessel.yaml`'s `pack` field names the `{pack}` directory; expression values are filenames relative to it.

A download also includes a short install README alongside the folders above. See [`personality-injection.md`](./personality-injection.md) for how `awaken` uses the bundled `.mdc` rule.

To load and run an Engram, unzip it into your Eidola folder, launch the Shrine, and click Awaken — see [`cli-mcp-reference.md`](./cli-mcp-reference.md) for that flow and the chat-based MCP tools that mirror it.

---

## Vessel format

`vessel.yaml` `type` field declares the pack format: `"lottie"`, `"webm"`, `"mp4"`, or `"gif"`. Shrine plays all four through the same crossfade/min-hold pipeline (`"mp4"` and `"webm"` share a `<video>`-based player; `"gif"` and `"lottie"` each have their own).

---

## engram.yaml

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `engram_version` | yes | string | Edit-history semver for your own tracking. New Engrams start at `1.0.0`; the Forge bumps it on save. Must be well-formed semver. |
| `id` | yes | string | Slug. Matches directory name. |
| `name` | yes | string | Display name. |
| `voice_id` | yes | string \| null | Reserved for future voice support. Currently always `null`. |
| `meta.author` | yes | string | User or creator handle. |
| `meta.created` | yes | string | ISO date (`YYYY-MM-DD`). |
| `meta.description` | no | string | Short summary for directory browse cards and detail pages. |
| `meta.tags` | no | string[] | Browse/filter tags. |
| `extensions` | yes | object | User namespace. Preserved verbatim across migrations; never migrated by Eidola. |

---

## vessel.yaml

Read directly by the MCP server and the Shrine overlay display — it has no version field of its own; `engram.yaml`'s `engram_version` covers the whole Engram.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `type` | yes | `"lottie"` \| `"webm"` \| `"mp4"` \| `"gif"` | Clip format. |
| `pack` | yes | string | Vessel pack id → `vessels/{pack}/`. |
| `expressions` | yes | object | Maps state name → clip filename (`.json` for Lottie, `.webm`/`.mp4`/`.gif` otherwise). |
| `transitions.default` | no | `"crossfade"` \| `"cut"` | Default transition between clips. Default: `crossfade`. |
| `transitions.duration_ms` | no | number | Crossfade duration. Default: `300`. |
| `playback.idle_loops` | no | boolean | Loop idle clip. Default: `true`. |
| `playback.approval_idle_ms` | no | number | Mid-turn approval idle timer (ms). Overlay-only; used when gated-tool hooks go silent. Default: `3000`. |
| `playback.success_hold_ms` | no | number | How long the overlay holds `success` before returning to idle. Overlay-only. Default: `3000`. |
| `playback.min_hold_ms` | no | number | Minimum time a visual state must remain on screen before the next can play (see [animation-crossfade-tuning.md](./animation-crossfade-tuning.md)). Overlay-only. Default: `1000`. |

### Expression states

`expressions` can map any of these state names to a clip. See [`vessel-reactivity.md`](./vessel-reactivity.md) for what each state name means and what triggers it in Cursor and Claude Code.
