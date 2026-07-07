# bskill — M1 build status

Vertical slice: capture → segment-shaped recording → zero-LLM template distill →
relay → replay, gated on a real record/replay round-trip + `skills-ref validate`.

## Built and verified (79 tests, all packages typecheck)

| Package | Module | What | Verified |
|---|---|---|---|
| `shared` | schema, effect, segment | Recording schema, `EffectTag`, `roundUpEffect`, `classifyStepEffect` (zero-LLM safety heuristic), `assertSingleSegment` guard | unit |
| `extension` | redact | Capture-time secret redaction — value + URL (path/query/fragment), adversarial-battery hardened after a security review | unit + adversarial |
| `extension` | selector | Selector-stack computation (ARIA→test-attr→id→CSS→text) | unit (happy-dom) |
| `extension` | capture | `buildCaptureStep` — composes selector+effect+redaction into a Step | unit (happy-dom) |
| `cli` | distill | Recording → Agent Skill directory (SKILL.md, replay.ts, walkthrough, changelog, immutable recording.json) | unit |
| `cli` | safety-gate | `gateStep` — destructive→confirm, heal-no-retry-on-partial | unit (8 cases) |
| `cli` | replay | `runSkill` — deterministic run loop + gate integration, injected `StepDriver` | unit (fake driver) |
| `cli` | bin | `bskill distill <file>` | run end-to-end on a sample |
| `fixture-app` | page, server | Deterministic invoice app; `?variant=b` shifts selectors for the heal path | unit + booted |
| `integration` | record-distill | record→distill against the real fixture page | unit (happy-dom) |

Run everything: `pnpm test` · `pnpm typecheck`

## Remaining for M1 (needs a live Chrome — not buildable-blind)

These are browser I/O glue over the tested cores above. They must be built AND
verified against a real browser; do not mark done from typecheck alone.

1. **MV3 manifest + content-script listeners** — capture-phase listeners that
   call the tested `buildCaptureStep` on click/change/keydown/navigation and
   stream steps to the side panel. Thin shell over `buildCaptureStep`.
2. **Side panel** — task-name, start/stop, live step counter, relay pairing
   status (mints/pins the token per §5.3).
3. **CDP relay** — the hard part (flagged as the M1 risk). CLI hosts the WS
   endpoint (`bskill relay`); the extension connects OUT and bridges to
   `chrome.debugger`. **Adapt playwright-mcp's extension-mode bridge** (decision
   D12) — do this with its source in hand and a live browser to test.
4. **Playwright `StepDriver` adapter** — a thin impl of the tested `StepDriver`
   interface using `connectOverCDP`; `runSkill` already orchestrates it.
5. **`bskill run <skill>`** — load skill, get `CHROME_CDP_URL` from the relay,
   drive `runSkill` with the Playwright adapter, honor `--confirm-destructive`.
6. **Bundling** — Vite + CRXJS to package the extension.
7. **`skills-ref validate`** — install the agentskills.io validator and gate CI
   on it (the M1 template output must already conform).

## M1 acceptance procedure (the gate)

1. `pnpm --filter @bskill/fixture-app serve` → note the URL.
2. Load the unpacked extension (once bundled) into your real Chrome.
3. Open the side panel, start recording, perform the delete-invoice flow on the
   fixture, stop. Confirm a `recording.json` is produced with no raw secret.
4. `bskill distill <recording.json>` → skill directory; `skills-ref validate` it.
5. `bskill relay` in one terminal; `bskill run delete-invoice-inv-001
   --confirm-destructive` in another. **Gate:** it replays against the default
   Chrome profile via the relay and completes.
