# Contributing to skillwright

Thanks for your interest! skillwright is early and contributions are welcome —
bug reports, docs, fixtures, and code.

## Ground rules

- **Test-first (TDD).** Production code lands with a test that failed first.
  This isn't ceremony — the safety-critical parts (effect tagging, the replay
  gate, secret redaction) are only trustworthy because they're pinned by tests.
  A PR that adds behavior without a test that exercised it will be asked to add one.
- **The safety gate and redaction are load-bearing.** Changes that touch effect
  classification, the replay safety gate, or secret redaction get extra scrutiny
  and must keep their invariants (see `SECURITY.md`). Don't weaken a
  `destructive` default or a redaction rule to make a test pass.
- **Be honest in docs.** If something is a limitation, say so. The roadmap names
  real gaps on purpose.

## Setup

```bash
pnpm install
pnpm exec playwright install chromium   # for integration tests
```

## The loops

```bash
pnpm test          # unit + integration + conformance
pnpm typecheck     # workspace-wide (tsc --build)
pnpm eval          # distiller eval suite — needs a live LLM backend; costs tokens
```

`pnpm eval` runs the golden-fixture suite against a real backend (`agent-cli`
by default, or `SKILLWRIGHT_API_KEY` for the API backend). It is **not** part of
`pnpm test` — run it on demand or when you change distiller prompts. The passing
baseline is `packages/evals/BASELINE.md`.

## Layout

pnpm monorepo:

- `packages/shared` — recording schema, effect model, redaction (shared by
  extension + CLI)
- `packages/cli` — the `skillwright` CLI: distill, replay, heal, install, LLM backends
- `packages/extension` — MV3 Chrome extension (capture + CDP relay client)
- `packages/evals` — distiller eval suite (rubric + golden fixtures)
- `packages/fixture-app` / `packages/integration` — a deterministic test app + e2e tests

Design docs live in `docs/superpowers/specs/` — read the relevant milestone
spec before a substantial change; it captures the decisions and their rationale.

## Pull requests

- Branch off `main`, keep PRs focused.
- Green `pnpm test` + `pnpm typecheck` before you push.
- Describe what changed and why; link the issue.
- Commit messages: imperative mood, explain the *why*.

By contributing you agree your work is licensed under the project's
[MIT License](LICENSE).
