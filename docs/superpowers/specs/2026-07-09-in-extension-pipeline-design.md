# In-Extension Pipeline — Design

**Date:** 2026-07-09
**Status:** Approved design, pre-plan
**Feature:** Bring the full skillwright compiler pipeline into the Chrome extension — capture → distill → parameterize → generate CDP script → export → verify — with a proposer/critic feedback engine for parameterization.

## 1. Motivation & thesis alignment

skillwright's north-star is **"the compiler for browser skills that any agent can run"** — you demonstrate a task once and get a deterministic, portable, inspectable artifact (SKILL.md + replay script), consumable by any agent via Agent Skills + the MCP facade. This is a *different category* from live agentic browsers (Claude for Chrome, Operator): a compiler that emits a reusable, auditable artifact, not an agent that re-reasons over the page every run.

This feature makes that pipeline usable end-to-end **inside the extension**, for a **developer / agent-builder** audience, **fully local** with a bring-your-own-key model. Explicitly rejected: a hosted backend (would turn an OSS tool into a SaaS the maintainer must run, pay for, and secure — and route users' captured browser data through a third party). Explicitly rejected: framing this as a "non-technical, autonomous, do-anything" product — that competes head-on with the big labs' agentic browsers and dilutes the compiler differentiation.

The genuinely differentiating piece is **parameterization**: turning a one-off recording into a reusable *function* by correctly identifying its variable inputs. That is the compiler thesis, made interactive.

## 2. Goals & non-goals

**Goals (v1)**
- Run capture → distill → parameterize → script-gen → export entirely from the extension side panel.
- A proposer/critic self-critique loop for identifying variable inputs, with a single human approval step.
- BYO-key LLM (Anthropic / OpenAI), fully local; secrets never leave the machine.
- In-extension **Verify**: test-run the generated steps against the current tab via `chrome.debugger`.
- Frictionless export into the user's local skill library (File System Access API), with a universal fallback.
- **One compiler engine, two frontends**: the CLI and the extension run the *same* distill/parameterize/script code.

**Non-goals (v1)**
- Cross-origin iframe replay (needs `Target.setAutoAttach({flatten})` + `sessionId` plumbing — follow-up).
- A hosted/cloud backend of any kind.
- Native-messaging host for export.
- Competing on general autonomous browsing.

## 3. CDP & platform verification (research-backed)

Verified against the Chrome DevTools Protocol and Chrome extension docs; each row confirmed the design or sharpened it.

| Area | Finding | Consequence |
|---|---|---|
| `chrome.debugger` foundation | All needed domains (Input/DOM/Runtime/Page/Network/Target) reachable; version `"1.3"` correct; an *active* session keeps the MV3 service worker alive | In-extension replay is viable |
| SW lifecycle | Listeners must be registered at **top level**; reattach on SW rehydration | **Must-fix groundwork** — current code registers `onEvent` per-recording inside an async fn (leaks; drops on SW restart) and has **no `onDetach` handler**. Fixes a latent capture bug today. |
| Debugger infobar | "…started debugging this browser" banner cannot be hidden by any API | Accept as a documented UX wart; warn before Verify |
| DevTools coexistence | Extension cannot share a tab with open DevTools (auto-detach) | Verify must handle detach gracefully |
| Input replay | Relay path already does real CDP coordinate clicks + simple keys | Upgrade: typing `.value`-JS → `Input.insertText` (with focus); enrich keys with `text` (Enter→`\r`), correct `code` vs `key`, a fuller virtual-key table, and a `modifiers` bitmask |
| File upload | `DOM.setFileInputFiles{objectId, files}` is the trusted mechanism; page-JS `.value` is blocked (matches our own code comment) | **Closes the file-upload gap** cheaply: eval the existing shadow-piercing `resolveElement` with `returnByValue:false` → `objectId` → `setFileInputFiles` on the already-attached session |
| Cross-origin iframes | Separate CDP targets; need `Target.setAutoAttach({flatten})` (Chrome 125+) + per-child `sessionId` | Net-new work → **v1 non-goal** |
| Passive network capture | Built correctly on `Network.enable` + `requestWillBeSent` (metadata + request body; response bodies would need eviction-prone `getResponseBody`) | No change needed |
| Export: File System Access | `showDirectoryPicker({mode:"readwrite"})` works from the **side panel** (a document, not the SW); dodges the popup-focus `AbortError` bug; no new manifest permission | Primary export path |
| Export: grant persistence | `FileSystemDirectoryHandle` persists in IndexedDB; readwrite re-confirmed via `queryPermission`→`requestPermission` (one click at most on return) | Pick folder once |
| Export: dotfolders | Native dialogs hide dotfolders; picking `~/.skillwright` directly is a dead-end | Pick a **visible** parent; extension creates a `skillwright/<slug>/` subtree inside it |

## 4. Architecture — one engine, two frontends

```
packages/shared/                 ← the engine (pure, env-agnostic: no fs / child_process)
  distill/                       ← MOVED from cli: distill.ts, passes, semantic, sanitize, slug, step-label
  parameterize/                  ← NEW: proposer + critic + reconcile
  script/                        ← MOVED from cli: to-replay-steps, replay renderer, apply-inputs
  llm/LlmClient.ts               ← NEW: interface { complete({system,messages,maxTokens}) -> text }  (injected)
  types.ts                       ← Recording, Step, EffectTag, SkillDirectory, ParamSpec

packages/cli/                    ← frontend #1 (behavior unchanged, now consumes shared engine)
  LlmClient  = agent-cli / SKILLWRIGHT_API_KEY
  output     = write SkillDirectory.files to ~/.skillwright

packages/extension/              ← frontend #2 (new capability, side panel)
  LlmClient  = fetch -> Anthropic/OpenAI (BYO key)
  output     = File System Access -> skillwright/<slug>/  (fallback: chrome.downloads subpath)
  UI         = 6-stage pipeline + parameter-approval view
  replay     = chrome.debugger (Verify)
```

**The only integration seams are `LlmClient` and the output sink.** The engine takes an `LlmClient`, returns a `SkillDirectory` + `ParamSpec[]`, and never knows whether it runs under Node or a service worker. `distill()` already returns a pure `SkillDirectory { slug, files: Record<string,string> }` with no disk writes and only pure-string helper imports — so the extraction is mostly *moving* code, guarded by the existing ~350 tests.

## 5. In-extension pipeline (6 stages, side panel)

```
[1 Record] -> [2 Distill] -> [3 Parameterize] -> [4 Generate script] -> [5 Export]   ·   [6 Verify]
  capture       engine          proposer/critic      engine.script          FS Access      chrome.debugger
  (exists)      (shared)          (shared + UI)        (shared)              / downloads     vs current tab
```

1. **Record** — existing capture path; produces an in-memory `Recording`.
2. **Distill** — `distill(recording, llmClient)` → `SkillDirectory` + draft `ParamSpec[]`. Falls back to the zero-LLM distiller on LLM failure so authoring never hard-blocks.
3. **Parameterize** — proposer → critic → reconcile (Section 6), then a human approval view.
4. **Generate script** — shared renderer emits the portable replay script from the approved skill+params. This artifact targets an *external* CDP endpoint (Playwright/`--cdp`) so any agent or `node` run can execute it. (Distinct from stage 6, which runs in-extension.)
5. **Export** — Section 7.
6. **Verify** — "Test run against this tab" via `chrome.debugger`, using the Input/file fidelity upgrades. Destructive steps gated OFF by default. Closes the capture→see-it-work loop in-browser.

## 6. Parameterization engine (`packages/shared/parameterize/`)

**Data model:** `ParamSpec { name, type, required, source:{stepIndex,field}, exampleValue, rationale, confidence }`. Feeds the existing `skillwright-inputs` SKILL.md frontmatter (already emitted by `semantic.ts`) and the existing `{placeholder}` substitution in `apply-inputs.ts`. No new artifact format.

**Three passes (exactly 2 LLM calls, bounded regardless of recording size):**
1. **Proposer** (LLM) — proposes which captured values are variables vs constants, with name/type/required.
2. **Critic** (LLM) — adversarial second pass over the recording + proposal: missed inputs (fixed-looking but task-specific, e.g. an account ID), over-parameterization (UI-fixed value marked variable), wrong types/required. Returns challenges + adjusted list.
3. **Reconcile** (deterministic code, no LLM) — merge rules: secrets/redacted values are **always** parameters (existing `passes.ts` rule enforced as a code floor the LLM cannot override); critic removals require a stated reason; otherwise union. Emits final `ParamSpec[]` with per-param rationale + confidence.

**Approval UI:** panel shows the reconciled list — name, type, required toggle, captured example value, rationale, variable⇄constant toggle. One approval; quality from the two-agent pass.

## 7. LLM client, secrets, and export

**LlmClient** — `complete({system, messages, maxTokens}) -> text`, with a structured-JSON variant for proposer/critic. CLI implements over agent-cli / `SKILLWRIGHT_API_KEY`. Extension implements over `fetch`.

**Extension LLM config** — provider (Anthropic/OpenAI) + API key entered in panel settings, stored in `chrome.storage.local`; provider endpoint added to `host_permissions`. Anthropic browser path sets `anthropic-dangerous-direct-browser-access: true`.

**Secret safety** — the recording is already redacted (`redact.ts`) before any LLM sees it; the API key lives only in extension storage and is **never** written into the skill, recording, or export bundle.

**Export tiers**
- **Tier 1 (primary):** File System Access from the side panel. First export: "Choose skill folder" → `showDirectoryPicker({mode:"readwrite", id:"skillwright", startIn:"documents"})` (a **visible** parent). Persist the handle in IndexedDB. Write `skillwright/<slug>/{SKILL.md, scripts/replay.ts, recording.json}` via created subdirs + `createWritable()`. Return sessions: `queryPermission`→`requestPermission` (≤ one click).
- **Tier 0 (fallback):** `chrome.downloads` into a `skillwright/<slug>/` Downloads subpath (permission already held). Used if the picker misbehaves or permission is revoked.
- **Power-user (documented, not v1 code):** POST the bundle to the existing localhost relay (port 9333) when the CLI is running, letting the CLI write with full path freedom.

## 8. Error handling

- **LLM failure** (bad key / rate limit / network): surfaced in panel with retry; distillation falls back to the zero-LLM distiller.
- **Verify failure:** destructive steps gated OFF by default; a failed step reports which step + selector and offers the existing tiered heal or skip; never auto-runs destructive.
- **FS permission revoked / picker abort:** silent fall back to Tier 0 download.
- **SW restart mid-verify:** rely on the top-level `onEvent`/`onDetach` + reattach groundwork; if the attachment is genuinely lost, abort Verify cleanly with a message.
- **Debugger infobar:** warn the user before Verify attaches.

## 9. Testing

- **Engine (shared):** unit-test proposer/critic/reconcile with a *fake* `LlmClient` (canned responses); assert deterministic floors (secret→always param; critic-removal-needs-reason). The existing ~350 distill/script tests must still pass after the move (proves the refactor is behavior-preserving).
- **Extension:** `LlmClient` fetch adapter (mocked fetch); FS-Access export (mocked handle + `createWritable`); the verify-runner step logic; the debugger lifecycle fix (top-level listeners, `onDetach`).
- **Integration:** extend the existing headed real-extension e2e to drive the full panel pipeline; add `dogfood-parameterize.mjs`.
- **CLI:** unchanged behavior, guarded by existing tests after the engine move.

## 10. Phased implementation outline (feeds writing-plans)

1. **Engine extraction** — move distill/script into `packages/shared`; introduce `LlmClient`; refactor CLI to consume it. Green when all existing tests pass unchanged.
2. **Debugger lifecycle fix** — top-level `onEvent`/`onDetach`, reattach on SW rehydration, per-tab targeting. (Also fixes capture today.)
3. **Parameterize engine** — proposer/critic/reconcile in `packages/shared/parameterize/`, fully unit-tested with a fake `LlmClient`.
4. **Extension LlmClient + settings** — `fetch` adapter, provider/key config in `chrome.storage.local`, `host_permissions`.
5. **Panel pipeline UI** — the 6-stage flow + parameter-approval view.
6. **Export** — Tier 1 FS Access + IndexedDB handle; Tier 0 downloads fallback.
7. **Verify + CDP fidelity upgrades** — `Input.insertText` typing, enriched keys, `DOM.setFileInputFiles`; destructive gate; heal/skip on failure.
8. **Integration/dogfood** — extend headed e2e; `dogfood-parameterize.mjs`.

Each phase lands as a small green slice (TDD, per-phase commit), consistent with the project's working style.
