// Canonical implementation lives in `@eidola/tool-state` (re-exported here
// via `vendor/tool-state-workspace-registry.ts`, same indirection the rest
// of this package already uses) so `@eidola/cli` and `@eidola/claude-hooks`
// share one writer instead of two hand-synced copies of the
// `~/.eidola/workspace.json` format. Routing through the vendor module keeps
// this file covered by `prepare-dist.mjs`'s existing import-rewrite for the
// published bundle. Uses the `/workspace-registry` subpath (not the main
// `vendor/tool-state.ts` barrel) because that module is Node-only
// (fs/os/path) and the main `@eidola/tool-state` barrel must stay
// browser-safe for `@eidola/shrine`'s Vite bundle.
export {
  eidolaConfigDir,
  workspaceRegistryPath,
  writeWorkspaceRegistry,
  readWorkspaceRegistry,
  writeWorkspaceFromCwd,
  type WorkspaceRegistry,
} from './vendor/tool-state-workspace-registry.js';
