# Eidola Runtime

The open, MIT-licensed core of [Eidola](https://eidola.app) — middleware that
gives AI personas a visible, reactive presence inside the editors developers
already use (Cursor, Claude Code, and Cowork).

Eidola injects a persona's **Soul** into your editor session via an MCP
server, and a local **Shrine** display shows a **Vessel** (animated avatar)
that reacts in real time to tool activity and model state. This repo is the
local-first middleware Shapers run themselves — no lock-in, fully auditable.

The hosted Directory (publishing, browsing, auth) and the Forge authoring
tool live in a separate private platform repo. This repo is just the runtime
Shapers install and run locally.

## What's in this repo

| Package | Published as | What it does |
|---|---|---|
| `packages/cli` | [`@eidola/cli`](https://www.npmjs.com/package/@eidola/cli) | MCP server + CLI. Runs over stdio (`eidola mcp`) for editor integration, or serves the Shrine HTTP display (`eidola launch shrine`). Also installs hook relays and MCP config for Cursor/Claude Code. |
| `packages/tool-state` | `@eidola/tool-state` | Shared tool-name → Vessel visual-state mapping, used by both hook relay packages and the Cursor extension. |
| `packages/cursor-hooks` | `@eidola/cursor-hooks` | Reads Cursor agent hook events and relays them to the local state socket. |
| `packages/claude-hooks` | `@eidola/claude-hooks` | Reads Claude Code hook events and relays them to the local state socket. |
| `packages/shrine` | `@eidola/shrine` | The Shrine — a local HTTP server that renders the active Vessel (Lottie/WebM/Three.js) and reacts to live state over SSE. |
| `packages/cursor-ext` | `eidola-state-bridge` (VS Code Marketplace) | Optional VS Code extension for coarser LM-state signals inside Cursor. Not published under the `@eidola/*` npm scope — it's a Marketplace listing, not an npm package. |

The **Engram spec** — the open format for persona packages (`SOUL.md`,
`vessel.yaml`, `engram.yaml`) — lives in [`docs/spec/`](./docs/spec). The
spec stays open regardless of what gets built or monetized on top of it.

## Install

```bash
pnpm install
pnpm build
```

To run the test suite across all packages:

```bash
pnpm test
```

Each package can also be built/tested individually with `pnpm --filter <package> run build`.

## Platform

The Directory (public Engram browsing + publishing) and Forge (Engram
authoring web app) are part of a separate, private platform repo that
consumes these runtime packages as versioned npm dependencies
(`@eidola/cli@^x.y.z`, etc.). That repo is not public.

## Contributing

This repo is young and still stabilizing its public release shape. Issues
and PRs are welcome — please open an issue to discuss substantial changes
before sending a PR, since the Engram spec format and the hook
relay/state-socket protocol are both meant to stay stable across Shaper
installs. Run `pnpm build && pnpm test` before submitting.

## License

MIT — see [LICENSE](./LICENSE). The Engram spec format is, and will remain,
open regardless of what gets built or monetized on top of it.
