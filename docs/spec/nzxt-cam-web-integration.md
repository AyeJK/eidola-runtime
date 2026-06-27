# NZXT Kraken LCD

If you have an NZXT Kraken AIO with an LCD, you can show your Vessel directly on the pump display using NZXT CAM's Web Integration feature.

## Setup

1. Make sure Shrine is running (`launch_shrine`).
2. In NZXT CAM, add a Web Integration pointing at:

   ```
   http://127.0.0.1:9743/shrine/
   ```

   Or use the deep link to open it directly in CAM:

   ```
   nzxt-cam://action/load-web-integration?url=http://127.0.0.1:9743/shrine/
   ```

   If your system doesn't have a protocol handler registered for `nzxt-cam://`, use this fallback instead:

   ```
   https://cam-redirect.nzxt.com/action/load-web-integration?url=http://127.0.0.1:9743/shrine/
   ```

CAM requires `http://`, not `file://` — point it at the URL above, not a local file path.

## What you'll see

On the Kraken Elite V2, the display is automatically detected and shown as a 640×640 circle to match the pump's LCD shape. The same Shrine view also opens in a normal browser window so you can preview and configure it before it shows up on the device.

## Configuration

If Shrine doesn't pick the right display preset automatically, you can set it explicitly via `EIDOLA_SHRINE_SURFACE`, or `shrine_surface` in `.cursor/eidola.json`.

The Shrine HTTP port defaults to `9743` and can be overridden with `EIDOLA_SHRINE_HTTP_PORT`.
