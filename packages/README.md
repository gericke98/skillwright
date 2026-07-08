# skillwright — M1 build status

Vertical slice: capture → segment-shaped recording → zero-LLM template distill →
relay → replay. **M1 GATE CLOSED (2026-07-07):** recorded search+delete once in
real Chrome, distilled it, and `skillwright run <slug> --relay --confirm-destructive`
replayed it against the real default profile via the extension relay and
actually deleted the invoice row (trusted `chrome.debugger` click). The safety
gate blocks the destructive step without `--confirm-destructive`. Remaining
polish: wire `skills-ref validate` into CI (the one M1 checklist item not yet
automated).

## Built and verified (103 tests; capture + replay proven against a real browser)

| Package | What | How verified |
|---|---|---|
| `shared` | Recording schema, effect tags, `roundUpEffect`, `classifyStepEffect`, `assertSingleSegment` | unit |
| `extension` | Capture-time redaction (value + URL path/query/fragment), selector-stack computation, `buildCaptureStep`, `coalesceSteps`, `RecordingSession` | unit + adversarial |
| `extension` | **Loadable MV3 recorder** (manifest, content script, background, side panel, CRXJS bundle) | **loaded in real Chrome — captured a live recording with correct redaction + effect tags** |
| `cli` | `distill` → skill dir, `gateStep`, `runSkill`, `translateSelector`, `toReplaySteps`, `PlaywrightStepDriver`, `runSkillByName`, `skillwright distill`/`run` | unit + **real Chromium** |
| `fixture-app` | Deterministic invoice app; `?variant=b` for the heal path | unit + booted |
| `integration` | record→distill; **replay against real Chromium** | unit + real browser |

**Replay proven end-to-end (this is the big one):** against real Playwright
Chromium over `connectOverCDP` — the same transport the relay provides — a
distilled skill loads from disk and **actually deletes the invoice row**; and
**without `--confirm-destructive` the safety gate blocks the destructive click
and the row survives**. The selector stack falls from a broken ARIA primary to
`[data-testid]` and still completes.

Run: `pnpm test` · `pnpm typecheck` · fixture: `pnpm --filter @skillwright/fixture-app serve`

## Remaining for M1 — just the CDP relay + two small items

1. **CDP relay (the last hard piece).** `skillwright relay` hosts a WS endpoint; the
   extension connects OUT via `chrome.debugger` and bridges CDP so
   `connectOverCDP` reaches the user's DEFAULT profile. Adapt playwright-mcp's
   extension-mode bridge (D12). Everything downstream of the CDP endpoint is
   already proven — the relay only has to *produce* that endpoint.
2. **Re-verify the recording download filename** — moved from a service-worker
   data URL (which Chrome named `download.json`) to a Blob download in the side
   panel (proper filename). Built + typechecked; needs a live record to confirm.
3. **`skills-ref validate`** — install the agentskills.io validator; gate CI.

## M1 acceptance gate

Serve fixture → load extension → record delete-invoice → distill →
`skills-ref validate` → `skillwright relay` + `skillwright run <slug> --confirm-destructive`
replays against the default profile via the relay and completes.
(All steps except the relay transport are verified working.)
