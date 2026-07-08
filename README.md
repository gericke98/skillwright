<div align="center">

# skillwright

**Show your browser a task once. Get a skill any agent can run — forever.**

[![CI](https://github.com/gericke98/skillwright/actions/workflows/ci.yml/badge.svg)](https://github.com/gericke98/skillwright/actions/workflows/ci.yml)
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

<div align="center">

![skillwright replaying a skill and self-healing a broken selector](docs/assets/replay-heal.gif)

<sub>A distilled skill replaying against a live app — the recorded selector is
stale, so skillwright heals the step from the live page and completes the delete.
Reproduce it: <code>pnpm demo</code>.</sub>

</div>

## What you get — a portable, readable skill

`distill` produces a standard [Agent Skill](https://agentskills.io) directory.
The `SKILL.md` is human-readable, typed, and effect-tagged — an agent can run it
as a script *or* follow it as instructions:

```markdown
---
name: approve-invoice
description: Approves a pending invoice in Acme Billing by invoice number. Use
  when asked to approve, release, or sign off an invoice.
compatibility: Requires Node 20+, a Chrome CDP endpoint (skillwright relay), and
  an authenticated session in that browser.
metadata:
  version: "1.0"
  skillwright-inputs: '[{"name":"invoice_number","type":"string","required":true}]'
---

# Approve an invoice

## Inputs
- `{invoice_number}` (string, required)

## Steps
1. [readonly]    Open the invoices list.
2. [mutating]    Enter {invoice_number} into the "Search invoices" field.
3. [destructive] Click "Approve invoice {invoice_number}" to release it.
```

```
approve-invoice/
├── SKILL.md              # the above — instructions + typed inputs + effect tags
├── scripts/replay.ts     # deterministic Playwright-over-CDP replay
├── references/walkthrough.md   # full step narrative + selector stacks
└── assets/recording.json # immutable, redacted evidence
```

## Why not just record-and-replay?

Classic recorders (Selenium IDE, Playwright codegen, RPA tools) freeze your
clicks into brittle scripts against XPaths. skillwright is different on the axes
that actually matter:

| | record-replay / RPA | pure-LLM browser agent | **skillwright** |
|---|---|---|---|
| Reliability | brittle (breaks on any UI change) | non-deterministic every run | **deterministic script + self-heal fallback** |
| Understands intent | no | yes (but re-derives it every time) | **once, then frozen into a reusable skill** |
| Runs on your real session | usually a fresh automation profile | varies | **your authenticated Chrome, via a CDP relay** |
| Safe on destructive actions | no notion of it | hope for the best | **effect from HTTP method + label; confirms before delete/pay/send** |
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

- **Captures network truth, not just clicks.** A passive CDP observer records the
  real HTTP calls behind each action. The method (`GET`/`POST`/`DELETE`) is a
  *non-LLM* safety signal — a `DELETE` firing is hard proof a step is destructive —
  and the request URL/body corroborate which values are real parameters. DOM
  gestures give intent; the network gives ground truth.
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

**CLI** — two ways:

```bash
# From the GitHub Release (works today — no npm account needed):
# download the skillwright-*.tgz asset from the latest Release, then:
npm i -g ./skillwright-*.tgz          # or: npm i -g <tarball-url>

# From npm (once published with provenance):
npm i -g skillwright                  # or: npx skillwright <command>
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
skillwright run <skill> --cdp <url> --timeout 15   # raise the per-step wait for slow apps

# 3. Make it discoverable to your agents (Claude Code + Codex, etc.):
skillwright install <skill> --project .  # → .claude/skills/ and .agents/skills/
skillwright list                         # library + install locations
skillwright promote <skill>              # promote a proven heal to canonical
```

The distiller backend is pluggable: **agent-cli** by default (autodetects
`claude` / `codex` / `gemini`), or the **Anthropic API** via `SKILLWRIGHT_API_KEY`.

## Consume a skill from any agent

- **Script mode** — an agent runs `skillwright run <skill>` (deterministic,
  zero-LLM unless a heal is needed).
- **Semantic mode** — an agent with its own browser tools reads the SKILL.md and
  follows the steps; the walkthrough's selector stacks make that reliable.
- **MCP mode** — `skillwright mcp` runs a Model Context Protocol server that
  exposes every installed skill as a callable **tool**, so agents that consume
  tools (OpenAI, LangGraph, Cursor, Claude, …) can list and run your skills:

  ```jsonc
  // in any MCP client's config
  { "mcpServers": { "skillwright": { "command": "skillwright", "args": ["mcp"] } } }
  ```

  Discovery via `.claude/skills` / `.agents/skills` covers Claude Code, Codex, and
  Cursor; the MCP server covers everything else. Same skill, every agent.

## Status & roadmap

Pre-1.0. The full pipeline — capture → semantic distill → self-healing replay →
install — is built and green (each milestone gated against something real: a
live LLM, real Chromium, and a real non-Anthropic agent). Honest gaps on the way
to 1.0:

- [ ] Publish to npm + Chrome Web Store submission
- [x] Live network-truth capture (passive CDP observer) + API-replay mode
- [x] Tier-3 heal over the relay transport (extension ARIA snapshot channel)
- [x] Real-world hardening — dogfooding public sites fixed 4 bugs (selector
      priority, a nested-URL secret leak, form-field anchors, selector uniqueness)
- [x] **Shadow DOM** — capture pierces the boundary via `composedPath()` (the
      real inner element, not the retargeted host); both replay paths pierce open
      shadow roots (Playwright natively, the relay resolver recurses shadow roots).
- [x] **Iframes** — capture runs in every frame (`all_frames`); replay works
      across frames on the Playwright/cdp path (incl. cross-origin — Playwright
      isn't bound by same-origin policy) and same-origin on the relay path.
- [ ] **Cross-origin iframe replay over the *relay*** — an in-page resolver can't
      reach cross-origin frames (a browser security boundary); use the cdp path.
- [ ] Copy-mode install divergence handling on Windows / restricted filesystems
- [ ] Broaden the eval fixture corpus toward real-world sites

## Development

pnpm monorepo. `pnpm test` · `pnpm typecheck` · fixture app:
`pnpm --filter @skillwright/fixture-app serve`. The distiller eval suite runs
on-demand (token cost): `pnpm eval`. See [CONTRIBUTING.md](CONTRIBUTING.md) and
the design specs in `docs/superpowers/specs/`.

## License

[MIT](LICENSE) © Santiago Gericke
