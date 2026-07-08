# Personality Injection

When you awaken an Engram, Eidola binds its personality — the Soul, written in `SOUL.md` — into your editor. The agent doesn't just see the Soul once; the personality carries forward for the rest of your session, in both Cursor and Claude Code.

## What happens when you awaken an Engram

- **Applied immediately:** `awaken` hands the agent the Soul as context for your current conversation right away.
- **Applied going forward:** Eidola also writes an editor-specific file so the personality keeps applying automatically afterward, without needing to awaken again every time you start a new chat.

## In Cursor

Eidola links an always-on Cursor rule at `.cursor/rules/{engram-id}.mdc`, compiled from `SOUL.md`. This rule applies to every chat in the workspace for as long as it's active.

- Engrams downloaded from the Directory already ship with a precompiled `.mdc` — the Forge compiles it from `SOUL.md` at export time, and `awaken` reuses that file directly rather than recompiling. For locally-authored Engrams that were never exported through the platform, or if the bundled `.mdc` is missing, `awaken` compiles one from `SOUL.md` on the spot.
- The rule file is generated from `SOUL.md` — don't hand-edit it. Edit `SOUL.md` instead, then re-run `awaken` to recompile. `awaken` checks the bundled `.mdc`'s content against the current `SOUL.md` on every link and recompiles automatically when they no longer match, so a stale bundled rule never lingers after you edit the Soul.
- Eidola also writes `.cursor/eidola.json`, a small file that records which Engram is currently linked to the workspace.

## In Claude Code

Eidola copies `SOUL.md` to `.claude/souls/{engram-id}.md` and adds an import line for it inside your workspace's `CLAUDE.md`. Claude Code loads that import automatically at the start of every session, so the personality is active with no extra step.

The import lives inside a clearly marked block in `CLAUDE.md`:

```
<!-- eidola:soul:start -->
@.claude/souls/example-engram.md
<!-- eidola:soul:end -->
```

Everything else in `CLAUDE.md` is left untouched.

## Switching personas

Awakening a different Engram automatically replaces the previous one:

- In Cursor, the previous Engram's rule is deleted outright.
- In Claude Code, the previous Engram's soul file is removed and the `CLAUDE.md` import is repointed at the new one.

## Putting an Engram to sleep

Calling `sleep` reverses what `awaken` set up: it deletes the Cursor rule, removes the Claude Code import and soul file, and clears the Shrine display.

## Keeping personas in sync

If you edit an Engram's `SOUL.md` after awakening it, re-run `awaken` to refresh the personality everywhere it's bound — the compiled Cursor rule is never the source of truth, `SOUL.md` is. Re-running `awaken` always recompiles the Cursor rule when it no longer matches `SOUL.md`, even if a precompiled `.mdc` was bundled with the Engram. If `SOUL.md` changes while an Engram stays awakened without a fresh `awaken` call (e.g. mid-session), Eidola prints a warning to the console telling you to re-awaken.

## One persona per workspace

A Cursor workspace binds to a single Engram at a time. To switch to a different persona, awaken it — the previous one is removed automatically, as described above.

---

## Related specs

- Engram format: [`engram-format.md`](./engram-format.md)
- Reactive Vessel states: [`vessel-reactivity.md`](./vessel-reactivity.md)
