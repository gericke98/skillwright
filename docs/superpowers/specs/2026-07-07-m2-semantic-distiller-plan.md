# M2 — Semantic Distiller + Eval Suite (Build Plan)

**Milestone (spec §14.2):** Real LLM distillation (intent, narrative, parameterization, effect tags)
with the hardened agent-cli adapter; golden-fixture evals built alongside the prompts.
**Gate:** evals pass on 5–10 golden recordings, including destructive-tag recall and secret-redaction.

**Builds on M1:** `distill.ts` (zero-LLM template), `classifyStepEffect` heuristic, `roundUpEffect`,
`assertSingleSegment`, the skill-directory contract (§7), and `skills-ref validate` conformance.

**Method:** test-first (TDD), phase-gated. Each phase has a falsifiable gate; do not advance until green.

**Status:** P0 ✅ done (eval rig fails on zero-LLM baseline as designed) · P1 ✅ done (backend +
adapters; live-CLI smoke folded into P3) · P2 ✅ done (semantic distiller; golden fixtures pass on
MockBackend; `skills-ref` binary unavailable → structural frontmatter conformance stands in) · P3 ⏳ next.

---

## Design decisions locked before coding

1. **Effect tagging is LLM-with-a-heuristic-floor, not LLM-alone.** The LLM assigns each step's
   `effect`, but the final tag is `roundUpEffect([llmTag, classifyStepEffect(step)])` — the M1 heuristic
   can only *raise* severity, never be downgraded by the model. This directly mitigates the accepted
   cross-model residual risk (§spec "CROSS-MODEL": LLM tagging is a safety-critical control) with
   defense-in-depth, and it's free — the heuristic already exists.
2. **Redaction is capture-time (extension) + a second-pass net in distill.** Capture-time redaction
   (M1, §5.2) is the primary control; distill re-scans every output file it writes (§9). The eval
   suite asserts NO secret survives in ANY output — that assertion is the release gate, not the code.
3. **The eval harness is built first (Phase 0), before the distiller it measures.** The M2 gate *is*
   the eval suite; building the measurement rig first makes "distiller quality" falsifiable from day one.
4. **A deterministic `MockBackend` serves all unit tests; real backends serve only Phase 1 smoke +
   Phase 3 evals.** Plumbing (parameterization, narrative shape, stub fallback) is tested with canned
   JSON so unit tests are fast, offline, and don't burn tokens.

---

## Phase 0 — Golden fixtures + eval harness (measurement rig first)

Build the thing that scores the distiller before the distiller exists. Baseline it against the M1
zero-LLM distiller — most evals should FAIL (that's the RED at the milestone level).

**Deliverables**
- `packages/evals/` — 5–10 golden recording fixtures as `Recording` JSON:
  - ≥2 **adversarial redaction** fixtures: token-in-URL (`?access_token=…`, `#access_token=…`),
    API-key-shaped string typed into a text field, card-shaped value (Luhn-valid).
  - ≥2 **destructive-tag** fixtures: delete/send/submit/pay steps (reused by M3's safety-gate suite).
  - remainder: representative multi-step tasks with typed inputs to parameterize.
- Each fixture ships a hand-authored **expectations** file (required params, expected secret-free
  invariant, expected destructive step indices, expected frontmatter keys).
- `eval-runner`: runs a recording through a supplied distiller, scores against the rubric, emits a
  scorecard (JSON + human table). Backend is injected (mock for scaffolding, real in Phase 3).

**Rubric**
- **Hard gates (must be 100%, release-blocking):** destructive-tag recall (no destructive step
  under-tagged), secret non-leakage (no secret substring in any output file), frontmatter valid +
  `skills-ref validate` passes.
- **Soft-scored (report + threshold, tune in Phase 3):** required-param extraction recall/precision,
  narrative step-completeness, agent-cli JSON extraction reliability.

**Gate:** the runner executes end-to-end against the **M1 zero-LLM distiller**, produces a scorecard,
and correctly reports the redaction/param/narrative evals as FAILING — proving the rig measures real
quality rather than rubber-stamping. (Destructive-tag may already pass via the heuristic; that's fine.)

---

## Phase 1 — LLM backend interface + adapters (§6.3)

**Deliverables** (`packages/cli/src/llm/`)
- `LlmBackend` interface: `complete(prompt, jsonSchema) → Promise<validated object>`.
- **JSON extraction hardening** (own module, own unit tests): scan fenced code blocks → first
  parse-valid JSON object → tolerate leading/trailing prose. Unit cases mirror §10 exactly (fenced,
  bare-with-prose, multiple blocks, malformed-then-repair).
- **Schema-repair reprompt loop** with retry budget: **3 for agent-cli, 1 for api**. On final failure,
  throw a typed `SchemaExhaustedError` (Phase 2's stub fallback catches it).
- **`agent-cli` adapter** — autodetect `claude` / `codex` / `gemini` binaries, invoke headless/
  non-interactive, pipe prompt in, capture stdout, run it through the extractor.
- **`api` adapter** — Anthropic API via `BSKILL_API_KEY`, native structured output where available,
  retry budget 1.
- **`MockBackend`** — returns canned JSON keyed by prompt fixture; the unit-test workhorse.

**Gate:** all extraction/repair unit tests green (every §10 case); one live smoke test against a real
detected CLI backend returns schema-valid JSON for a single distiller prompt.

---

## Phase 2 — Semantic distiller (the product) (§6.1)

Replace the M1 template internals with LLM passes. Every sub-capability is unit-tested with
`MockBackend` (golden recording → expected skill shape). `skills-ref validate` conformance held from M1.

**Deliverables** (rework `distill.ts` into orchestrated passes)
1. **Intent inference** — task purpose + keyword-rich, third-person `description`.
2. **Parameterization** — detect demo-typed values, promote to a typed input schema
   (`metadata.bskill-inputs`), rewrite step values as `{placeholders}`; **secrets are always params**.
3. **Semantic narrative** — per-step NL with selector rationale/gotchas → SKILL.md body (<500 lines)
   + full `references/walkthrough.md`.
4. **Effect tagging** — LLM tag per step, then `roundUpEffect([llmTag, heuristicTag])` (decision #1);
   round-up-on-uncertainty; write into `x-bskill`, mirror in walkthrough, carry into `replay.ts` meta.
5. **`agent:` prose steps** — judgment-dependent steps (extraction, conditional branch, wait-for-human)
   emitted as structured prose in SKILL.md, never frozen into `replay.ts`.
6. **Second-pass redaction net** — re-scan every output file before write (decision #2).
7. **Stub-skill fallback** — on `SchemaExhaustedError`, emit a stub skill (raw redacted recording +
   auto-summary) so demonstrated work is never lost (§8).

**Gate:** mocked-LLM unit tests green for every pass (including stub fallback and second-pass
redaction); `skills-ref validate` passes on generated output; the Phase-0 evals, still on `MockBackend`,
now pass their plumbing assertions.

---

## Phase 3 — Wire real distiller into evals + close the M2 gate

**Deliverables**
- Run the Phase-0 golden fixtures through the **real** distiller with a real agent-cli backend
  (local `claude`) and/or the api backend (CI secret `BSKILL_API_KEY`).
- Iterate prompts against the scorecard until thresholds are met.
- `pnpm eval` command — on-demand + on prompt-change only (token cost), **not per-push** (§13).
- Record the passing scorecard as the baseline benchmark for future prompt iteration.

**Gate (= M2 milestone gate):**
- Evals pass on all 5–10 golden recordings.
- **Destructive-tag recall = 100%** (no destructive step under-tagged).
- **Secret non-leakage = 100%** (no secret in any output file, all adversarial fixtures).
- Frontmatter valid + `skills-ref validate` green on every generated skill.

**Residual-risk checkpoint (spec §"UNRESOLVED DECISIONS"):** if destructive-tag recall proves weak
here, revisit the safety-gate trust model **before M3 ships**.

---

## Out of scope for M2 (deferred to M3/M4)
- Tier-3 heal / write-back / quarantine-promote, and the runtime replay safety gate → **M3**
  (M3 *consumes* M2's effect tags).
- `bskill install`, npm publish, extension delivery, release CI → **M4**.

## Sequencing summary
```
P0 fixtures+harness ──(fails on zero-LLM = RED)──▶ P1 backend ──▶ P2 distiller ──▶ P3 real evals (GATE)
```
