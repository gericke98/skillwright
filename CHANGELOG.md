# Changelog

All notable changes to skillwright are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`skillwright run --timeout <seconds>`.** Overrides the per-step driver
  timeout on the `--cdp` replay path. The default (3s) is tuned for the test
  fixture; real apps (SPA route transitions, slow backends, AJAX spinners) can
  exceed it, so a user hitting a slow site can now raise the wait without
  editing code. A missing/non-numeric/zero/negative value is ignored (keeps the
  default) rather than degrading every step into an instant failure. No-op on
  the relay path (that times out in the extension) — a note is printed if
  combined with `--relay`. Async-enabled inputs on real sites were validated to
  already work via Playwright's auto-wait (`dogfood-dynamic.mjs`).

## [0.1.0] - 2026-07-08

First tagged release. The full v1 pipeline is built, tested (300+), and CI-green.
The CLI publishes to npm once an `NPM_TOKEN` is configured; the extension ships as
an unpacked zip on the GitHub Release.

### Added

- **Capture → distill → replay (M1).** MV3 extension records a browser task; a
  zero-LLM template distiller produces a standard Agent Skill directory; a CDP
  relay replays it against the user's real, authenticated Chrome profile.
- **Semantic distiller + eval suite (M2).** LLM-backed distillation — intent,
  typed parameterization, per-step narrative, and effect tagging — behind a
  pluggable backend (`agent-cli` default, Anthropic `api` opt-in). A golden-fixture
  eval suite (`skillwright` distiller scored against a rubric) gates on
  destructive-tag recall and secret non-leakage; last run 6/6 on a live backend.
- **Self-heal + write-back + safety gate (M3).** Tier-3 agentic step completion
  when a selector stack goes stale; a replay safety gate (effect-tagged,
  confirmation-required destructive steps, double-send guard); healed selectors
  are quarantined and promoted to canonical only after repeated clean
  confirmations (`skillwright promote`). Heal now works over the **relay
  transport** too (an ARIA snapshot channel), not just the cdp path — so a skill
  self-heals against the user's real authenticated Chrome.
- **Install + distribution (M4).** `skillwright install` / `list` / `sync`
  symlink skills into `.claude/skills/` and `.agents/skills/`; publishable npm
  package; CI + tag-driven release workflows; verified executable in script mode
  from a non-Anthropic agent (Codex CLI).
- **MCP facade.** `skillwright mcp` runs a Model Context Protocol stdio server
  exposing every installed skill as a callable tool, so tool-consuming agents
  (OpenAI, LangGraph, Cursor, …) can run skills too — not just SKILL.md readers.
  Destructive steps stay gated (surfaced as an MCP error unless opted in).
- **Runtime inputs.** `skillwright run <skill> --input name=value` (and MCP tool
  arguments) substitute `{placeholder}` values into steps at run time; a missing
  required input fails fast before any browser action. Parameterized skills now
  actually take parameters.
- **Network-aware distillation.** The distiller compiles from network truth — a
  demo value that also appears in a captured request URL/body is treated as
  strong evidence it's a real parameter. Request bodies (POST/PUT) are captured
  and redacted too.
- **API-replay mode** (`skillwright run --api`). A step can replay AS its captured
  HTTP request (with the live authenticated session) instead of driving the DOM —
  faster, deterministic, immune to UI churn. Still safety-gated; a mutating/
  destructive API-replay that fails never falls back to the DOM (double-execute
  guard). Verified e2e against real Chromium.

### Fixed

Four real bugs found by dogfooding the pipeline against real public sites (the
clean fixture hid them). Manual dogfood tools live at
`packages/integration/dogfood-*.mjs`.

- **Selector priority.** A stable `text/<label>` now ranks ABOVE the brittle deep
  `nth-of-type` CSS path (was reversed — replay broke on any layout change).
- **Nested-URL secret leak** 🔒 (see Security).
- **Form-field anchors.** Inputs identified only by `placeholder`/`name` (no text)
  got a brittle positional path; now `[name=…]` and `[placeholder=…]` are stable
  anchors.
- **Selector uniqueness.** On a list of identical elements, every one led with an
  ambiguous `text/` selector matching all of them — the relay would click the
  wrong row. Selectors that uniquely identify the target are now promoted above
  ambiguous ones.

### Security

- Secret redaction at capture time and again during distillation, enforced by
  adversarial eval fixtures (no secret survives in any generated file).
- Localhost-only relay with two-party, constant-time token auth.
- **Fixed a real secret-leak vector (found dogfooding):** a token in the page URL
  was forwarded URL-encoded inside analytics-beacon query params and survived
  `redactUrl`. URL path/query/fragment components are now tokenized on URL
  delimiters so nested secrets are caught.
- **Network-truth effect signal (Capture v2):** effect tags can now be derived
  from the HTTP method a step fired (`GET`→readonly, `POST/PUT/PATCH`→mutating,
  `DELETE`→destructive) and fused as a non-LLM floor that can only raise severity —
  retiring the residual risk of the safety gate trusting LLM-inferred tags alone.
  A passive CDP network observer captures the traffic (via Playwright CDPSession
  and a `chrome.debugger` adapter wired into the extension recording path),
  correlating requests to the steps that fired them.

[Unreleased]: https://github.com/gericke98/skillwright/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/gericke98/skillwright/releases/tag/v0.1.0
