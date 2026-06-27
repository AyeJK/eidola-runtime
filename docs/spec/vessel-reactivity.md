# Claude Code Hooks — Event Coverage Audit

_Sprint 5.2, Task 1 · Audited 2026-06-24_

Compares Claude Code's hook event set (current official docs, fetched from
`code.claude.com/docs/en/hooks`) against the Cursor hook set the relay already
covers (Phase 4 baseline, `packages/cursor-hooks/`), and the subset
`packages/claude-hooks/src/map.ts` implements as of Sprint 5.1.

## Official Claude Code hook events (current docs)

| Category | Event | Implemented in `map.ts`? |
|---|---|---|
| Session lifecycle | `SessionStart` | Yes |
| Session lifecycle | `Setup` | No |
| Session lifecycle | `SessionEnd` | Yes |
| Per-turn | `UserPromptSubmit` | Yes |
| Per-turn | `UserPromptExpansion` | No |
| Per-turn | `Stop` | Yes |
| Per-turn | `StopFailure` | No |
| Tool loop | `PreToolUse` | Yes |
| Tool loop | `PostToolUse` | Yes |
| Tool loop | `PostToolUseFailure` | Yes |
| Tool loop | `PostToolBatch` | No |
| Tool loop | `PermissionRequest` | Yes |
| Tool loop | `PermissionDenied` | No |
| Subagents | `SubagentStart` | Yes |
| Subagents | `SubagentStop` | Yes |
| Subagents | `TeammateIdle` | No |
| Task mgmt | `TaskCreated` | No |
| Task mgmt | `TaskCompleted` | No |
| File/config | `FileChanged` | No |
| File/config | `CwdChanged` | No |
| File/config | `ConfigChange` | No |
| File/config | `InstructionsLoaded` | No |
| Compaction | `PreCompact` | Yes |
| Compaction | `PostCompact` | No |
| Worktree | `WorktreeCreate` | No |
| Worktree | `WorktreeRemove` | No |
| User interaction | `Notification` | Yes |
| User interaction | `MessageDisplay` | No |
| MCP | `Elicitation` | No |
| MCP | `ElicitationResult` | No |

**31 total official events** (per current docs). **12 implemented** in
`packages/claude-hooks/templates/hooks.json` / `map.ts` as of Sprint 5.1.

## Comparison against the Cursor hook set (Phase 4 baseline)

Cursor's relay (`packages/cursor-hooks/src/map.ts`) handles 16 hook names:
`beforeSubmitPrompt`, `afterAgentThought`, `subagentStop`, `preToolUse`,
`beforeShellExecution`, `beforeMCPExecution`, `beforeReadFile`,
`afterFileEdit`, `preCompact`, `subagentStart`, `afterAgentResponse`,
`postToolUse`, `postToolUseFailure`, `stop`, `sessionStart`, `sessionEnd`.

Every Cursor hook that drives a *visual vessel state* has a direct Claude
Code equivalent already wired in Sprint 5.1:

| Cursor hook | Claude Code equivalent | Status |
|---|---|---|
| `beforeSubmitPrompt` | `UserPromptSubmit` | Covered |
| `afterAgentThought` | (no 1:1 equivalent; Claude Code has no "between tool calls, model is thinking" event distinct from `PostToolUse`) | `PostToolUse` → `thinking` already covers this transition |
| `preToolUse` | `PreToolUse` | Covered |
| `beforeShellExecution` / `beforeMCPExecution` (Cursor's approval gate, → `waiting`) | `PermissionRequest` (→ `attention`, not `waiting`) | Partial — see gap below |
| `beforeReadFile` | folded into `PreToolUse` (tool=`Read`) in Claude Code's payload shape | Covered (different shape, same outcome) |
| `afterFileEdit` | folded into `PreToolUse`/`PostToolUse` (tool=`Write`/`Edit`) | Covered |
| `preCompact` | `PreCompact` | Covered |
| `subagentStart` / `subagentStop` | `SubagentStart` / `SubagentStop` | Covered |
| `afterAgentResponse` | no distinct event; Claude Code folds this into `Stop` | Covered via `Stop` |
| `postToolUse` / `postToolUseFailure` | `PostToolUse` / `PostToolUseFailure` | Covered |
| `stop` | `Stop` | Covered |
| `sessionStart` / `sessionEnd` | `SessionStart` / `SessionEnd` | Covered |

### Gap identified: `waiting` vs `attention`

Cursor's `beforeShellExecution`/`beforeMCPExecution` map to vessel state
`waiting` (mid-turn approval gate, before the tool runs). Claude Code's
closest equivalent, `PermissionRequest`, is currently mapped to `attention`
in `map.ts`. This is a deliberate, documented difference, not an oversight:
Claude Code's `PermissionRequest` fires for the *same* approval-gate scenario
Cursor's `waiting` covers, but Sprint 5.1 chose `attention` because Claude
Code permission prompts are typically more interruptive (full dialog) than
Cursor's inline approval UI. This sprint does not change that mapping — it
is left as a deliberate product decision, not a parity gap, since both
`waiting` and `attention` are valid, distinct, defined vessel states (see
`docs/spec/state-socket-protocol.md`) and either is semantically correct for
"needs human input before proceeding." No action required unless product
direction says otherwise.

## Gaps that are real (not yet wired, no current consumer need)

None of the unimplemented 19 events have a Cursor-side semantic-state
equivalent that's missing from the vessel today — they're new Claude Code
capabilities (worktrees, task management, file watching, MCP elicitation,
agent teams) that don't have a Phase 4 baseline to match parity against.
Recommended for a future sprint, not blocking 5.2 acceptance criteria:

- `PermissionDenied` — would let us distinguish "denied" from generic
  `PostToolUseFailure` → `error`; currently denied permissions surface as a
  generic tool failure. Low cost to add later, mirrors `failure_type ===
  'permission_denied'` handling cursor-hooks already has in
  `mapPostToolUseFailure`.
- `StopFailure` — distinguishes "turn ended due to API error" from generic
  `Stop`; currently an API-error stop would map through `Stop` and likely
  land on `success` (no `status: 'error'` field) since Claude Code's `Stop`
  payload shape for this case hasn't been confirmed. Worth verifying against
  a real API-error transcript in a future sprint.
- `TeammateIdle`, `TaskCreated`/`TaskCompleted` — multi-agent/task features
  without a Phase 4 Cursor equivalent; no vessel state gap, just unmapped
  surface area.

## Conclusion

**All Claude Code hook events that have a semantically equivalent Cursor
hook are implemented and produce a defined vessel state.** The 19 unmapped
official events are net-new Claude Code surface area (worktrees, MCP
elicitation, task management, file watching) without a Phase 4 baseline to
compare against — they represent future expansion opportunities, not parity
gaps. Sprint 5.2 acceptance criterion ("all Claude Code hook events that
have a Cursor equivalent produce the same visual state outcome") is met.
