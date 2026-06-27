# Vessel Reactivity Spec

Your Vessel reacts to the same set of states no matter which editor you're using. Cursor and Claude Code each have their own hook system, but both are mapped through to the same vessel states, so an Engram behaves consistently in either editor.

## What triggers each state

| Vessel state | What's happening | In Cursor | In Claude Code |
|---|---|---|---|
| `thinking` | You submit a prompt, or the agent is reasoning between tool calls | Prompt submitted; model thinking | Prompt submitted; right after a tool finishes |
| `working` | The agent is doing anything tool-related — running a shell command or MCP tool, reading/searching files, writing/editing files, or running a subagent | Before running any tool (Shell, MCP, `Read`/`Grep`/`Glob`, `Write`/`Edit`), or a subagent | Before running any tool (Shell, MCP, `Read`/`Grep`/`Glob`, `Write`/`Edit`), or a subagent |
| `attention` | The agent needs you to approve something, or something needs your notice | Approval prompt before running a shell/MCP command; context compaction | Permission prompt; a notification; a denied permission |
| `success` | The turn finished and the agent used at least one tool | Turn ends normally | Turn ends normally |
| `responding` | The turn finished with a plain-text reply and no tools were used | Turn ends with no tool use | Turn ends with no tool use |
| `error` | The turn or a tool call failed | Tool failure; turn ends in error | Tool failure; turn ends in error |
| `idle` | Nothing is happening — session start/end, or a turn was cancelled | Session starts/ends; turn aborted | Session starts/ends |

`working` is a single visual state for all tool activity — the Vessel doesn't show different animations for "searching" vs "writing" vs "running a shell command," even though those are tracked as distinct events internally.

`waiting` isn't tied to a specific editor event either — it's a short, automatic display the Vessel shows for a few seconds right after a tool finishes, before settling into `thinking`.

## Parallel tools

If multiple tools are running at once, the Vessel stays on `working` until all of them finish — it won't flicker back to `thinking` just because one finished early.
