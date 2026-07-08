# Capture v2 · Slice 1 — Network-truth effect signal (Tier 0)

**Goal:** derive a step's effect from the HTTP method of the network calls it
triggered — a **non-LLM ground-truth signal** — and fuse it into the effect model
so it can only *raise* severity. This retires the one accepted residual risk (the
safety gate previously trusting LLM-inferred effect tags alone).

Smallest valuable slice of the Capture v2 proposal
(`docs/research/2026-07-capture-v2-network-truth.md`). Pure, testable logic first;
live CDP capture in the extension is a follow-up slice.

**Method:** test-first (TDD), phase-gated.

**Status:** P0 ✅ · P1 ✅ · **P2 ✅ — live network capture landed.** A passive CDP observer
(`NetworkCapturer` over a `CdpLike` interface) captures requests via Playwright's CDPSession (verified
e2e: a real DELETE → captured → correlated → `destructive`) AND via a `chrome.debugger` adapter wired
into the extension recording path (attach on start, correlate + detach on stop). The fixture now fires
real GET/POST/DELETE traffic. Full loop (capture + fusion) is real and verified headlessly. 255 tests.

---

## Design decisions

1. **Method → effect:** `GET/HEAD/OPTIONS` → readonly; `POST/PUT/PATCH` →
   mutating; `DELETE` → destructive. A step's network effect is the most severe
   across its correlated requests. No requests → `undefined` (contributes nothing).
2. **Fusion, not replacement:** `roundUpEffect([networkEffect?, llmTag,
   heuristicTag])`. Network truth is another *floor* — it raises, never lowers.
   Round-up-on-uncertainty is preserved.
3. **Correlation by time window:** each request is attributed to the most recent
   step at-or-before its timestamp, within a window (default 1500ms). Requires
   step timestamps (added, optional). Over-attribution biases toward more severe
   tags — the safe direction.
4. **Over-tagging is acceptable (safe bias).** A stray analytics `POST` bumping a
   step to `mutating` costs a confirmation prompt, never a silent destructive
   action. Curation/filtering is a later slice, not a slice-1 blocker.
5. **Redaction still owns URLs.** Correlated request URLs are redacted like every
   other captured URL before they land in the recording.

---

## Phase 0 — schema + pure logic (`@skillwright/shared`)

**Deliverables**
- `CapturedRequest` type (`method`, `url`, `status?`, `resourceType?`,
  `timestamp`) and an optional `timestamp?` on `Step`, optional `requests?` on
  `Step`, optional raw `network?: CapturedRequest[]` under `x-skillwright`.
- `deriveNetworkEffect(requests): EffectTag | undefined` — method → effect,
  most-severe-wins, undefined when empty.
- `correlateRequests(steps, network, windowMs?)` — attach each request to its
  triggering step by timestamp window; returns steps with `requests` populated.

**Gate:** unit tests green — method mapping (incl. case-insensitivity + unknown
methods rounding up), most-severe selection, empty → undefined, correlation
window edges (before first step, outside window, ties).

---

## Phase 1 — fuse into the distiller (`@skillwright/cli`)

**Deliverables**
- Extend the effect combination in both distill paths to include the network
  signal: `roundUpEffect([networkEffect(step.requests), llmEffect,
  heuristicEffect])`. The zero-LLM `classifyStepEffect` path and the semantic
  `combineEffect` path both consult it.
- `recording.json` continues to be the effect source of truth (already written by
  M2/M3); network-derived effects flow through it.

**Gate (= slice-1 gate):** a step correlated with a `DELETE` request is tagged
`destructive` even when its label and the LLM would say otherwise (network truth
raises the floor); a step with only `GET`s stays as-is; the eval suite's
destructive-recall still passes.

---

## Phase 2 (follow-up slice) — live network capture in the extension

- Attach a passive, read-only second CDP client; `Network.enable`; buffer
  request/response metadata eagerly on `responseReceived`; redact URLs/headers;
  emit the `network[]` stream into the recording. Not in slice 1 — this slice
  proves the *value* of the signal on recordings that carry it; the extension
  wiring lands next.

## Sequencing
```
P0 schema + deriveNetworkEffect + correlate ──▶ P1 distiller fusion (GATE) ──▶ [P2 extension capture, next slice]
```
