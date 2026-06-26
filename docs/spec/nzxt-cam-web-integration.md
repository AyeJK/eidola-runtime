# NZXT CAM Web Integration — Shrine Model

Validated against [NZXT developer docs](https://developer.nzxt.com/docs/development/) (2026-06).

## Dual-browser model

NZXT CAM Web Integration runs two Chromium renderers against the **same origin URL**:

| Browser | URL | Purpose |
|---------|-----|---------|
| **Configuration** | `http://127.0.0.1:9743/shrine/` | Setup UI — URL copy, deep link, preview |
| **Kraken (LCD)** | Same URL + `?kraken=1` | Vessel output streamed to pump LCD |

Session data (cookies, `localStorage`) is shared between both browsers.

## Kraken browser detection

CAM appends `?kraken=1` to the Kraken browser URL. Shrine also treats `window.nzxt.v1` as Kraken context when CAM injects device attributes.

```ts
const params = new URLSearchParams(window.location.search);
const isKrakenLcd = params.get('kraken') === '1' || window.nzxt?.v1 != null;
```

## `window.nzxt.v1` (Kraken browser only)

| Field | Kraken Elite V2 | Usage |
|-------|-----------------|-------|
| `width` | `640` | Viewport width (px) |
| `height` | `640` | Viewport height (px) |
| `shape` | `"circle"` | Apply circular clip when `"circle"` |
| `targetFps` | `60` | LCD refresh budget (informational in Shrine v1) |

Configuration browser does **not** receive `window.nzxt.v1`. Use `?kraken=1` in a normal browser to simulate the LCD view.

### Monitoring API (not used in Phase 2.2)

CAM 4.50+ exposes `window.nzxt.v1.onMonitoringDataUpdate(callback)` on the Kraken browser. Shrine Sprint 2.2 uses detection only — no telemetry fusion.

## Shrine HTTP endpoint

CAM requires `http://` (not `file://`). Shrine serves:

```
http://127.0.0.1:9743/shrine/          → configuration browser
http://127.0.0.1:9743/shrine/?kraken=1 → Kraken LCD simulation / device
```

Port override: `EIDOLA_SHRINE_HTTP_PORT` (default `9743`).

State events arrive via the existing MCP state socket (`127.0.0.1:9742`). The HTTP server bridges socket → browser SSE.

## Surface preset

`kraken-elite-v2` in `.cursor/eidola.json` (`shrine_surface`) or `EIDOLA_SHRINE_SURFACE`:

- 640×640 viewport
- Circular mask (`clip-path: circle(50%)`)
- Three.js **square** layout tier (same as `square-1-1`)

Electron monitor mode and CAM HTTP mode coexist — preset selects deployment path.

## Deep link

```
nzxt-cam://action/load-web-integration?url=http://127.0.0.1:9743/shrine/
```

Fallback (no protocol handler): `https://cam-redirect.nzxt.com/action/load-web-integration?url=...`

Beta CAM uses `nzxt-cam-beta://` and `cam-beta-redirect.nzxt.com`.

## References

- [NZXT Development docs](https://developer.nzxt.com/docs/development/)
- [@nzxt/web-integrations-types](https://www.npmjs.com/package/@nzxt/web-integrations-types)
