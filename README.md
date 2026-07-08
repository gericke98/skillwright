# skillwright — Browser Skill Learner

Capture a browser task once, and `skillwright` compiles it into a portable
[Agent Skill](https://agentskills.io) that any agent can replay against your
real, authenticated Chrome session — as a deterministic script **or** as
instructions an agent can reason about.

Not record-and-replay: a thin Chrome extension + CDP relay semantically
understand what you did, an LLM distills it into a skill (typed inputs, an
effect-tagged safety gate, a human-readable walkthrough), and replay **self-heals**
when the target site changes.

## Install

**CLI** (published to npm with provenance):

```bash
npm i -g skillwright      # or: npx skillwright <command>
```

**Extension** (v1 ships as an unpacked developer-mode load):

1. Download `skillwright-extension.zip` from the latest [GitHub Release](../../releases).
2. Unzip it.
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**,
   and select the unzipped folder.

> **Known v1 limitation.** Unpacked extensions show a startup nag and can be
> disabled on managed/enterprise profiles — the exact environment where internal
> tools often live. This is acceptable for v1's audience (dev-mode users, a
> builder's own machine); a Chrome Web Store submission is a deliberate
> fast-follow. The `debugger` permission invites review friction, so it must not
> gate v1.

## Quickstart

```bash
# 1. Record a task in Chrome via the extension side panel, then it saves a
#    recording.json. Distill it into a skill (LLM-backed):
skillwright distill recording.json --semantic

# 2. Replay against your real Chrome via the relay:
skillwright relay                        # hosts the WS endpoint; pair in the side panel
skillwright run <skill> --confirm-destructive

# 3. Make the skill discoverable to your agents (Claude Code + Codex etc.):
skillwright install <skill> --project .  # symlinks into .claude/skills/ and .agents/skills/
skillwright list                         # library + install locations
skillwright sync                         # refresh copy-mode installs
skillwright promote <skill>              # promote a proven heal to canonical
```

The distiller backend is pluggable: **agent-cli** by default (autodetects
`claude`/`codex`/`gemini`), or the **Anthropic API** via `SKILLWRIGHT_API_KEY`.

## Safety model

Every step is tagged `readonly` / `mutating` / `destructive` (LLM + a heuristic
floor that can only *raise* severity). A replay safety gate blocks destructive
steps without confirmation and never re-runs a step that may have partially
executed. Secrets are redacted at capture time and again during distillation —
no credential lands in a shareable artifact. See
`docs/superpowers/specs/` for the full design.

## Development

pnpm monorepo. `pnpm test` · `pnpm typecheck` · fixture app:
`pnpm --filter @skillwright/fixture-app serve`. The distiller eval suite runs
on-demand (token cost): `pnpm eval`.
