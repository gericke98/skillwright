<div align="center">

# skillwright

**Show your browser a task once. Get a skill any agent can run — forever.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: pre-1.0](https://img.shields.io/badge/status-pre--1.0-orange.svg)](CHANGELOG.md)
[![Built with TDD](https://img.shields.io/badge/built%20with-TDD-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

`skillwright` watches you perform a browser task **once**, understands it
semantically, and compiles it into a portable [Agent
Skill](https://agentskills.io) — a standard skill directory that any agent can
replay against your **real, authenticated** Chrome session, as a deterministic
script *or* as instructions it reasons about.

```bash
skillwright record                    # do the task once, in your own Chrome
skillwright distill recording.json    # → a typed, effect-tagged Agent Skill
skillwright run approve-invoice --input invoice=INV-1042
```

When the site changes and a selector breaks, `skillwright` **heals the step
itself** and keeps going — then earns the fix into the skill only after it's
proven across runs.

## Why not just record-and-replay?

Classic recorders (Selenium IDE, Playwright codegen, RPA tools) freeze your
clicks into brittle scripts against XPaths. skillwright is different on the axes
that actually matter:

| | record-replay / RPA | pure-LLM browser agent | **skillwright** |
|---|---|---|---|
| Reliability | brittle (breaks on any UI change) | non-deterministic every run | **deterministic script + self-heal fallback** |
| Understands intent | no | yes (but re-derives it every time) | **once, then frozen into a reusable skill** |
| Runs on your real session | usually a fresh automation profile | varies | **your authenticated Chrome, via a CDP relay** |
| Safe on destructive actions | no notion of it | hope for the best | **effect-tagged gate; confirms before delete/pay/send** |
| Portable across agents | no | tied to one framework | **a standard Agent Skill — runs in Claude Code, Codex, …** |
| Secrets | captured verbatim | in-context | **redacted before they touch disk** |

## How it works

```
   record            distill (LLM)              run
 ┌─────────┐      ┌──────────────────┐     ┌──────────────────────────┐
 │ Chrome  │ ───► │ intent           │ ──► │ Tier 1  deterministic    │
 │ ext +   │      │ parameters       │     │ Tier 2  selector stack   │
 │ CDP     │      │ narrative        │     │ Tier 3  agentic heal ────┼─► quarantine
 │ relay   │      │ effect tags 🛡    │     │         (safety-gated)   │    └► promote
 └─────────┘      └──────────────────┘     └──────────────────────────┘      after proof
```

- **A ladder of determinism.** Replay tries the fast, zero-LLM path first, falls
  down a stack of fallback selectors, and only escalates to an LLM to complete a
  step when the page has genuinely changed.
- **Self-healing that earns trust.** A successful heal is *quarantined* and used
  for that run, but promoted into the canonical skill only after repeated clean
  confirmations — so a plausible-but-wrong one-off fix can't poison a shared skill.
- **Safety is load-bearing.** Every step is tagged `readonly` / `mutating` /
  `destructive` (LLM judgment fused with a heuristic floor that can only *raise*
  severity). Destructive steps require confirmation; a step that may have
  partially executed is never retried. See [SECURITY.md](SECURITY.md).

## Install

**CLI** (published to npm with provenance):

```bash
npm i -g skillwright        # or: npx skillwright <command>
```

**Extension** (v1 ships as an unpacked developer-mode load):

1. Download `skillwright-extension.zip` from the latest [Release](../../releases).
2. Unzip it, open `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked**, and select the folder.

> **Known v1 limitation.** Unpacked extensions show a startup nag and can be
> disabled on managed/enterprise profiles. Acceptable for v1's audience
> (dev-mode users); a Chrome Web Store submission is a planned fast-follow.

## Quickstart

```bash
# 1. Record in Chrome via the side panel → it saves recording.json. Distill it:
skillwright distill recording.json --semantic

# 2. Replay against your real Chrome via the relay:
skillwright relay                        # hosts the endpoint; pair in the side panel
skillwright run <skill> --confirm-destructive

# 3. Make it discoverable to your agents (Claude Code + Codex, etc.):
skillwright install <skill> --project .  # → .claude/skills/ and .agents/skills/
skillwright list                         # library + install locations
skillwright promote <skill>              # promote a proven heal to canonical
```

The distiller backend is pluggable: **agent-cli** by default (autodetects
`claude` / `codex` / `gemini`), or the **Anthropic API** via `SKILLWRIGHT_API_KEY`.

## Two ways to consume a skill

- **Script mode** — an agent runs `skillwright run <skill>` (deterministic,
  zero-LLM unless a heal is needed).
- **Semantic mode** — an agent with its own browser tools reads the SKILL.md and
  follows the steps; the walkthrough's selector stacks make that reliable.

## Status & roadmap

Pre-1.0. The full pipeline — capture → semantic distill → self-healing replay →
install — is built and green (each milestone gated against something real: a
live LLM, real Chromium, and a real non-Anthropic agent). Honest gaps on the way
to 1.0:

- [ ] Publish to npm + Chrome Web Store submission
- [ ] Tier-3 heal over the relay transport (needs an extension snapshot channel)
- [ ] Copy-mode install divergence handling on Windows / restricted filesystems
- [ ] Broaden the eval fixture corpus toward real-world sites

## Development

pnpm monorepo. `pnpm test` · `pnpm typecheck` · fixture app:
`pnpm --filter @skillwright/fixture-app serve`. The distiller eval suite runs
on-demand (token cost): `pnpm eval`. See [CONTRIBUTING.md](CONTRIBUTING.md) and
the design specs in `docs/superpowers/specs/`.

## License

[MIT](LICENSE) © Santiago Gericke
