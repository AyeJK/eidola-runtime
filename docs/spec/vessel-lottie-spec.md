# Vessel Lottie Pack Spec

Canonical format for Lottie-based Vessel packs in Eidola (Phase 1.1+).

---

## Pack layout

```
vessels/{pack-id}/
  idle.json
  thinking.json
  …                     # one file per vessel.yaml expressions key
  tools/
    gif-to-lottie.mjs   # optional — Camina legacy conversion
    validate-pack.mjs
    audit-gifs.mjs
```

`engrams/{id}/vessel.yaml` references clips by filename. The `pack` field resolves to `vessels/{pack}/`.

---

## Canvas

| Property | Value |
|----------|--------|
| Width / height | **256 × 256** px |
| Aspect | Square; non-square sources are **letterboxed** |
| Letterbox fill | Void `#06060a` (matches overlay `--color-void`) |
| Safe area | Center 220 × 220 — keep face/eyes inside |

---

## Animation

| Property | Value |
|----------|--------|
| Lottie version | `5.7.4` |
| Frame rate | **15 fps** (`fr: 15`) |
| Loop | Seamless for `idle`; `thinking`, `working`, `searching`, `writing` loop during hook silence; one-shot for `responding`, `success`, `error`, `attention` |
| Max frames | 90 sampled frames per clip (conversion tooling cap) |
| Format | Raster image sequence embedded as base64 PNG assets, or vector rig |

---

## File size budget

| Tier | Limit |
|------|--------|
| Target | ≤ **450 KB** per clip |
| Hard max | **512 KB** per clip — `validate-pack.mjs` fails above this |

Oversized sources: downsample frames, reduce frame count, enable PNG palette compression.

---

## Layer naming (future vector rigs)

For hand-authored or code-generated vector faces:

| Layer | Name | Purpose |
|-------|------|---------|
| Root | `Vessel` | Face container |
| Eyes | `eye_l`, `eye_r` | Blink / gaze |
| Brow | `brow_l`, `brow_r` | Expression |
| Mouth | `mouth` | Talk / react |

Phase 1.1 Camina pack uses **raster GIF conversion** — layer naming optional until vector rigs ship.

---

## Quality gate

A clip **passes** when:

1. Parses as valid Lottie JSON at 256×256
2. Contains raster face assets (not a single-color ellipse placeholder)
3. Face readable at **~140 px** display width (overlay default)
4. `idle` loops without visible seam at crossfade boundaries
5. Under hard max file size

---

## Regeneration (Camina)

From `eidola-repo` root:

```bash
node vessels/camina-v1/tools/gif-to-lottie.mjs --all
node vessels/camina-v1/tools/validate-pack.mjs
```

Source GIFs: `eidola-repo-old/packs/camina/` (legacy art reference).

---

## References

- `docs/spec/engram-format.md` — expression keys and lineage table
- `vessels/camina-v1/tools/FALLBACK.md` — code-gen fallback if conversion fails QA
- `docs/Design/design-system.md` — Vessel states list
