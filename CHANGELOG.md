# Changelog

All notable changes to skillwright are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

The full v1 pipeline is built and green; not yet published to npm.

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
  confirmations (`skillwright promote`).
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

### Security

- Secret redaction at capture time and again during distillation, enforced by
  adversarial eval fixtures (no secret survives in any generated file).
- Localhost-only relay with two-party, constant-time token auth.
- **Network-truth effect signal (Capture v2, slice 1):** effect tags can now be
  derived from the HTTP method a step fired (`GET`→readonly, `POST/PUT/PATCH`→
  mutating, `DELETE`→destructive) and fused as a non-LLM floor that can only raise
  severity — retiring the residual risk of the safety gate trusting LLM-inferred
  tags alone. (Live in-extension network capture is a follow-up slice.)

[Unreleased]: https://github.com/gericke98/skillwright/commits/master
