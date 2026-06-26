// Canonical implementation lives in `@eidola/tool-state` — this package
// already depends on it for tool-name → vessel-state mapping, so importing
// the workspace-registry writer too avoids a second hand-synced copy of
// the `~/.eidola/workspace.json` format without adding a new dependency.
// Imported via the `/workspace-registry` subpath (not the main barrel)
// because that module is Node-only (fs/os/path) and the main barrel must
// stay browser-safe for `@eidola/shrine`'s Vite bundle.
export { writeWorkspaceFromCwd } from '@eidola/tool-state/workspace-registry';
