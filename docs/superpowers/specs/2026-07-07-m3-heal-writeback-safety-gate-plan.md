# M3 — Heal + Write-back + Replay Safety Gate (Build Plan)

**Milestone (spec §14.3):** Tier-3 agentic step completion, version bump + changelog; the safety gate
consumes M2's effect tags.
**Gate:** mutated fixture selectors heal and persist (quarantined candidate → promoted after proof);
a destructive-tagged step is never re-executed without confirmation (safety-gate suite green).

**Builds on:** `gateStep` (safety-gate.ts — already tested), `runSkill`/`StepDriver`/`ReplayStep`
(replay.ts), the `LlmBackend` layer (M2), effect tags in `recording.json` (M2), and the fixture app's
`?variant=b` selector break (M1).

**Method:** test-first (TDD), phase-gated. Each phase has a falsifiable gate.

**Status:** P0 ✅ · P1 ✅ (tier-3 heal + partial-fire guard + LLM healer) · P2 ✅ (quarantine →
promote-after-proof + `skillwright promote`) · P3 ✅ **— M3 GATE CLOSED.** Tier-3 heal recovers a
fully-broken destructive selector against real Chromium (with confirmation → row deleted; without →
blocked, row survives); heal wired into `skillwright run` (cdp + relay) with the promoted-selector overlay
and clean-run confirmation. 203 tests green. Note: heal fires only for drivers that can `snapshot()`
(Playwright/cdp); relay heal awaits an extension snapshot channel (M4+).

---

## Design decisions locked before coding

1. **`gateStep` is the single eligibility authority for heal — no parallel logic.** Selector-stack
   exhaustion means the step never executed → `partiallyExecuted: false`, so `readonly` and `mutating`
   steps heal; `destructive` returns `confirm` (halts unattended). A step that *did* fire but whose
   follow-up assertion failed is `partiallyExecuted: true` → `mutating`/`destructive` **halt** (the
   double-send guard). M3 adds no new safety branches; it routes failures through the existing gate.
2. **Heal never edits canonical files. Quarantine-before-promote.** A successful heal writes a
   candidate selector patch to `~/.skillwright/<slug>/.quarantine/`, used for the rest of THAT run
   only. It becomes canonical (patch `scripts/replay.ts`, bump `metadata.version`, append
   `references/CHANGELOG.md`) only after **N=2 clean confirmations** or explicit `skillwright promote`.
   `assets/recording.json` is immutable evidence — never modified, ever. This closes the poisoning
   path: a right-looking-but-wrong one-off heal shared across every project can't become permanent
   truth on first success.
3. **A heal "success" is provisional, not trusted.** The healer returns a selector; re-running the
   step is what validates it for the current run. Trust (promotion) is separate and earned. This is
   the crux both reviewers flagged — we don't let an LLM's first plausible answer rewrite the shared
   skill.
4. **The healer gets semantics, not just a broken selector.** It receives the step's intent (narrative
   + effect + the redacted target label) and a live page snapshot (ARIA tree + URL), and returns a new
   selector. Never a raw secret (snapshots are redacted like everything else).

---

## Phase 0 — Heal fixtures + safety-gate suite (safety rig first)

Build the destructive-tagged fixtures and the dedicated safety-gate suite (§10) that M3 must satisfy,
before the heal that satisfies them. `gateStep` already exists and is unit-tested; P0 adds the
*run-loop-level* invariants and the heal-fires premise.

**Deliverables**
- A **full-stack-break fixture**: a recording whose entire selector stack fails on `?variant=b`
  (unlike M1's variant-b, where the ARIA anchor survives at tier-2) — forcing tier-3. One `readonly`/
  `mutating` variant (auto-heal) and one `destructive` variant (confirm-required).
- Extend the safety-gate suite to the run loop: (1) a `destructive` step halts `runSkill` without
  `--confirm-destructive` and proceeds with it; (2) a heal on a `mutating`/`destructive` step flagged
  `partiallyExecuted` STOPS and emits the failure report; (3) a `readonly` step heals freely.

**Gate:** the run-loop safety invariants are green against the CURRENT (heal-less) `runSkill`; the
"tier-3 fires on full-stack break" assertion is RED (there is no heal yet) — that RED is what P1 turns
green.

---

## Phase 1 — Tier-3 heal (agentic step completion) (§6.2)

**Deliverables**
- `PageSnapshot` type (ARIA snapshot + URL; screenshot path optional) and a `snapshot()` capability on
  the driver (injected fake in tests, Playwright/relay in P3).
- `healStep(semantics, snapshot, backend) → { selector, rationale } | null` — LLM pass (schema-
  validated, reuses M2's repair loop) that proposes a selector for the failing step from the snapshot.
- Run-loop integration: on stack exhaustion, consult `gateStep({phase:"heal", partiallyExecuted})`;
  if `proceed`, snapshot → heal → retry the step with the candidate selector; on success continue the
  run; on `halt`/`confirm` emit the failure report unchanged. `readonly` heals freely; `mutating`
  heals only when not partially executed; `destructive` requires confirmation.

**Gate:** the full-stack-break `readonly`/`mutating` fixture heals via tier-3 (the LLM finds a working
selector) and the run completes; a `destructive` full-stack-break halts without `--confirm-destructive`.

---

## Phase 2 — Write-back: quarantine → promote-after-proof (§6.2, §8)

**Deliverables**
- Quarantine store: a successful heal writes a candidate patch (step index → new selector) under
  `.quarantine/`, used for the remainder of the run, NOT applied to canonical `scripts/replay.ts`.
- Confirmation tracking: each clean re-run that uses the candidate without re-healing increments its
  confirmation count.
- Promotion: at **N=2** confirmations or `skillwright promote <skill>`, the candidate patches
  `scripts/replay.ts`, bumps `metadata.version`, and appends the candidate→promoted transition to
  `references/CHANGELOG.md`. `assets/recording.json` is never touched.
- `skillwright promote <skill>` command; `skillwright run` failure report already carries what an agent needs.

**Gate:** a heal persists a quarantined candidate (canonical files unchanged on first success);
promotion bumps the version + writes the changelog and leaves `recording.json` byte-identical; a
first-success heal does NOT auto-promote.

---

## Phase 3 — Wire into `skillwright run` + real-driver acceptance

**Deliverables**
- Heal wired into both `runSkillByName` (cdp) and `runSkillViaRelay` (relay) paths, backend via the
  M2 factory.
- A real Playwright heal test against the fixture app: record on variant a, break the full stack on
  variant b, assert tier-3 completes the run and a quarantined candidate is written.

**Gate (= M3 milestone gate):** end-to-end heal against the fixture via a real driver; the destructive
step is never re-executed without confirmation (safety-gate suite green); full suite + typecheck clean.

---

## Out of scope for M3 (→ M4)
- `skillwright install`, npm publish, extension delivery, release CI, hardened two-party auth.

## Sequencing
```
P0 fixtures + safety suite ──(tier-3 fires = RED)──▶ P1 heal ──▶ P2 quarantine/promote ──▶ P3 real driver (GATE)
```
