export { loadEngramFromDirectory } from './engram/loader.js';
export { directoryContainsEngramIds } from './engram/engram-fingerprint.js';
export { listEngramDirectories, resolveEngramDirectory, findEngramEntry, resolveEngramLocation, type EngramListEntry } from './engram/registry.js';
export { parseEngramYaml, parseVesselYaml } from './engram/parse.js';
export { validateEngramVersion, parseSemver } from './engram/validate.js';
export {
  EngramLoadError,
  type EngramConfig,
  type EngramDirectoryOutput,
  type EngramMeta,
  type LoadedEngram,
  type VesselConfig,
  type VesselPlayback,
  type VesselTransitions,
  type VesselType,
} from './engram/types.js';
export { migrateJsonToDirectory } from './migrations/json-to-directory.js';
export type { LegacyEngramJson } from './migrations/types.js';
export {
  resolveEidolaPaths,
  resolveEidolaRuntimeConfig,
  type EidolaPaths,
  type EidolaRuntimeConfig,
} from './config.js';
export {
  STATE_PROTOCOL_VERSION,
  STATE_SOCKET_HOST,
  DEFAULT_STATE_SOCKET_PORT,
  DEFAULT_STATE_BUFFER_SIZE,
  SURFACES,
  VESSEL_STATES,
  type Surface,
  type StateBroadcast,
  type StateInboundEvent,
  type StateSocketConfig,
  type VesselState,
} from './socket/types.js';
export {
  createBroadcast,
  isKnownVesselState,
  normalizeInbound,
  parseInboundLine,
  serializeBroadcast,
} from './socket/protocol.js';
export { resolveExpressionClip } from './socket/expression.js';
export { resolveVisualState, WORKING_CLUSTER, isWorkingClusterState } from './vendor/tool-state.js';
export type { ResolveVisualStateInput, WorkingClusterState } from './vendor/tool-state.js';
export { createStateSocketServer, type StateSocketServer } from './socket/server.js';
export { SessionState, type ActiveEngramSnapshot } from './session/state.js';
export {
  buildSoulInjectionPayload,
  isValidSoulInjectionPayload,
  wrapSoulAsSystemReminder,
  type SoulInjectionPayload,
} from './soul/injection.js';
export { createToolHandlers, type EidolaToolHandlers, type ToolTextResult } from './tools/handlers.js';
export { startEidolaMcpServer } from './server.js';
export { autoActivateFromWorkspace, type AutoActivateResult } from './cursor/auto-activate.js';
export {
  launchShrine,
  ensureShrineRunning,
  type LaunchShrineResult,
  type LaunchShrineOptions,
  type EnsureShrineResult,
} from './cursor/ensure-shrine.js';
export {
  isShrineRunning,
  isProcessAlive,
  shrineLockPath,
  readShrineLock,
  removeShrineLock,
  stopShrine,
  writeShrineLock,
  type ShrineLockFile,
} from './cursor/shrine-lock.js';
export {
  resolveShrineSurface,
  normalizeShrineSurfaceInput,
  shrineSurfaceEnv,
  isHttpShrineSurface,
  shrineHttpPort,
  shrineHttpUrl,
  SHRINE_SURFACE_PRESETS,
  DEFAULT_SHRINE_SURFACE_PRESET,
  DEFAULT_SHRINE_HTTP_PORT,
  type ShrineSurface,
  type ShrineSurfacePresetId,
} from './cursor/shrine-surface.js';
export {
  compileSoulToCursorRule,
  parseCompiledCursorRule,
  setCursorRuleAlwaysApply,
} from './cursor/compile.js';
export { linkEngramToWorkspace, type LinkEngramResult, type LinkEngramParams } from './cursor/link-engram.js';
export {
  removeEngramFromWorkspace,
  type RemoveEngramResult,
} from './cursor/remove-engram.js';
export {
  writeWorkspaceRegistry,
  readWorkspaceRegistry,
  workspaceRegistryPath,
  type WorkspaceRegistry,
} from './workspace-registry.js';
export {
  writeMcpAwakenSignal,
  readMcpAwakenSignal,
  mcpAwakenSignalPath,
  type McpAwakenSignal,
} from './cursor/mcp-awaken-signal.js';
export { setupCursorHooks, type SetupCursorHooksOptions, type SetupCursorHooksResult } from './setup-hooks.js';
export { detectSoulSource, type SoulSource } from './cursor/soul-source.js';
export { computeSoulHash } from './cursor/hash.js';
export { warnIfStaleSoulCompile, type StaleSoulCompileCheck } from './cursor/stale.js';
export {
  buildWorkspaceConfig,
  cursorRulePath,
  EIDOLA_WORKSPACE_CONFIG_FILENAME,
  readWorkspaceConfig,
  workspaceConfigPath,
  writeWorkspaceConfig,
} from './cursor/workspace-config.js';
export type { CompiledCursorRule, EidolaWorkspaceConfig } from './cursor/types.js';
export { detectClient, type ClientInfoLike, type DetectedClient } from './client-detect.js';
export {
  copySoulToWorkspace,
  removeSoulFromWorkspace,
  claudeSoulPath,
  claudeSoulsDir,
  type CopySoulResult,
  type RemoveSoulResult,
} from './claude/copy-soul.js';
export {
  ensureSoulImport,
  removeSoulImport,
  hasClaudeMdSoulImport,
  findActiveSoulImportEngramId,
  claudeMdPath,
  CLAUDE_MD_FILENAME,
  type EnsureSoulImportResult,
  type RemoveSoulImportResult,
} from './claude/claude-md.js';
export { resolveActiveEngram, type ActiveEngramResult } from './active-engram.js';
export {
  postShrineAwaken,
  postShrineSleep,
  type PostShrineAwakenResult,
  type PostShrineSleepResult,
} from './cursor/shrine-awaken.js';
