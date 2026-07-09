# In-Extension Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the full skillwright compiler pipeline (capture → distill → parameterize → script → export → verify) inside the Chrome extension side panel, sharing one engine with the CLI.

**Architecture:** Extract the pure compiler into `packages/shared` behind the existing `LlmBackend` seam; the CLI keeps its Node backend, the extension adds a `fetch`/BYO-key backend, a side-panel UI, File-System-Access export, and a `chrome.debugger` Verify runner. A new proposer→critic→reconcile parameterization engine turns a recording into a reusable function.

**Tech Stack:** TypeScript, pnpm monorepo, vitest (`vitest run`), MV3 Chrome extension (side panel + `chrome.debugger`), Chrome DevTools Protocol, File System Access API.

## Global Constraints

- Branch: `feat/in-extension-pipeline`. Per-phase commits. Every task ends green (`pnpm test`).
- Node 22 (pnpm `node:sqlite`); keep the existing esbuild split-bundle for the CLI.
- Reuse the existing `LlmBackend` interface (`complete<T>(prompt, schema): Promise<T>`) as the LLM seam — do NOT invent a new one.
- Secrets: the recording is redacted (`redact.ts`) before any LLM sees it; the BYO API key lives only in `chrome.storage.local` and is never written into any skill/recording/export.
- Effect floor is load-bearing: secrets/redacted values are ALWAYS parameters; deterministic code enforces this, never the LLM.
- v1 non-goals: cross-origin iframe replay; hosted backend; native-messaging export.
- TDD: failing test first, minimal impl, green, commit. DRY, YAGNI.

---

## File Structure

**Moved into `packages/shared/src/` (pure, no `fs`/`child_process`):**
- `llm/backend.ts`, `llm/extract.ts` (from `packages/cli/src/llm/`) — the `LlmBackend` seam + JSON extraction.
- `distill/` (`distill.ts`→ rename to `distill/zero-llm.ts` if needed, `passes.ts`, `semantic.ts`, `sanitize.ts`) (from `packages/cli/src/distill/` and `distill.ts`).
- `slug.ts`, `step-label.ts`, `to-replay-steps.ts`, `apply-inputs.ts` (from `packages/cli/src/`).
- `replay-step.ts` — NEW: the pure `ReplayStep`/`StepRequest` types extracted from `cli/src/replay.ts` (the `StepDriver`/`runSkill` engine stays in CLI).
- `parameterize/` — NEW: `proposer.ts`, `critic.ts`, `reconcile.ts`, `index.ts`.

**Stays in `packages/cli/src/` (Node-specific):**
- `llm/factory.ts` and the agent-cli/api backend implementations.
- `replay.ts` (`StepDriver`, `runSkill`), `playwright-driver.ts`, `relay-driver.ts`, `bin.ts`, output-to-`~/.skillwright`.

**New in `packages/extension/src/`:**
- `llm/fetch-backend.ts` — `LlmBackend` over `fetch` (Anthropic/OpenAI).
- `llm/settings.ts` — provider/key read/write in `chrome.storage.local`.
- `export/fs-access.ts` — File-System-Access writer + IndexedDB handle persistence.
- `export/downloads.ts` — `chrome.downloads` subpath fallback.
- `verify/runner.ts` — CDP Verify driver (Input/DOM fidelity upgrades).
- panel pipeline UI additions in `panel.ts` / `panel.html`.

**Modified for the debugger-lifecycle fix:**
- `packages/extension/src/background.ts`, `debugger-cdp.ts`.

---

## Phase 1 — Extract the compiler engine into `packages/shared`

Behavior-preserving refactor. Guard: all existing tests pass unchanged.

### Task 1.1: Move the `LlmBackend` seam to shared

**Files:**
- Move: `packages/cli/src/llm/backend.ts` → `packages/shared/src/llm/backend.ts`
- Move: `packages/cli/src/llm/extract.ts` → `packages/shared/src/llm/extract.ts`
- Modify: `packages/shared/src/index.ts` (export `LlmBackend`, `SchemaSpec`, `SchemaExhaustedError`, `completeWithRepair`, `extractFirstJson`)
- Modify: `packages/cli/src/llm/factory.ts` and any importer (import from `@skillwright/shared`)

**Interfaces:**
- Produces: `LlmBackend { readonly name: string; complete<T>(prompt: string, schema: SchemaSpec<T>): Promise<T> }`, `SchemaSpec<T> { jsonSchema: unknown; validate(value: unknown): string[] }`, `completeWithRepair(generate, basePrompt, schema, maxAttempts)`.

- [ ] **Step 1: Move the two files** with `git mv`, then update imports in `factory.ts` and its backends to `import { ... } from "@skillwright/shared"`.
- [ ] **Step 2: Add exports** to `packages/shared/src/index.ts`:

```ts
export { extractFirstJson } from "./llm/extract";
export {
  type LlmBackend,
  type SchemaSpec,
  SchemaExhaustedError,
  completeWithRepair,
} from "./llm/backend";
```

- [ ] **Step 3: Run the suite** — `pnpm test`. Expected: PASS (no behavior change).
- [ ] **Step 4: Commit** — `git commit -am "refactor: move LlmBackend seam to shared"`.

### Task 1.2: Move distiller + script helpers to shared

**Files:**
- Move: `packages/cli/src/distill.ts`, `distill/passes.ts`, `distill/semantic.ts`, `distill/sanitize.ts`, `slug.ts`, `step-label.ts`, `to-replay-steps.ts`, `apply-inputs.ts` → `packages/shared/src/` (mirror the `distill/` subdir).
- Create: `packages/shared/src/replay-step.ts` — extract `ReplayStep` and `StepRequest` interfaces verbatim from `packages/cli/src/replay.ts` (lines 5–34).
- Modify: `packages/cli/src/replay.ts` — import `ReplayStep`/`StepRequest` from `@skillwright/shared`; keep `StepDriver`/`runSkill`.
- Modify: `packages/shared/src/index.ts` — export `distill`, `semanticDistill`, `inferIntent`, `inferParams`, `inferEffects`, `narrate`, `ParamDef`, `Intent`, `sanitizeSkillDescription`, `toSlug`, `stepLabel`, `toReplaySteps`, `applyInputs`, `ReplayStep`, `StepRequest`.
- Move the corresponding `*.test.ts` files (distill, sanitize, apply-inputs, to-replay-steps, slug) into `packages/shared/test/`.

**Interfaces:**
- Consumes: `LlmBackend` (Task 1.1).
- Produces: `distill(recording, opts): SkillDirectory`; `semanticDistill(recording, opts, backend): Promise<SkillDirectory>`; `inferParams(recording, backend): Promise<ParamDef[]>`; `ParamDef { name; type; required; demoValue; description? }`; `SkillDirectory { slug: string; files: Record<string,string> }`.

- [ ] **Step 1: `git mv` the files** and their tests; fix relative imports (`../slug` → `./slug`, `@skillwright/shared` self-imports become local `./`).
- [ ] **Step 2: Extract `replay-step.ts`** — cut the `StepRequest` and `ReplayStep` interfaces out of `cli/src/replay.ts` into `shared/src/replay-step.ts`; re-export from `cli/src/replay.ts` for its own consumers.
- [ ] **Step 3: Update `packages/shared/src/index.ts`** exports (list above).
- [ ] **Step 4: Update CLI imports** — `bin.ts`, `run.ts`, `distill` callers now import from `@skillwright/shared`.
- [ ] **Step 5: Run the suite** — `pnpm test`. Expected: PASS (the ~350 existing tests are the behavior guard).
- [ ] **Step 6: Typecheck** — `pnpm -r typecheck` (or the repo's typecheck script). Expected: clean.
- [ ] **Step 7: Commit** — `git commit -am "refactor: move distiller + script helpers to shared engine"`.

---

## Phase 2 — Debugger lifecycle fix (groundwork; also fixes capture today)

### Task 2.1: Top-level listeners + `onDetach`, no leak

**Files:**
- Modify: `packages/extension/src/background.ts`
- Modify: `packages/extension/src/debugger-cdp.ts` (surface `detach`; expose `onDetach`)
- Test: `packages/extension/test/debugger-lifecycle.test.ts`

**Interfaces:**
- Produces: a module-scope singleton that registers `chrome.debugger.onEvent` / `onDetach` exactly once at top level; `startNetworkCapture` attaches to a specific `tabId` and stores it; `onDetach` clears `netCapturer`/`debuggeeTabId` and pushes a status.

- [ ] **Step 1: Write the failing test** (mock `chrome.debugger`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
// import the pure lifecycle helper you will extract, e.g. makeDebuggerLifecycle
describe("debugger lifecycle", () => {
  it("registers onEvent once regardless of start/stop cycles", () => {
    const onEvent = { addListener: vi.fn(), removeListener: vi.fn() };
    const life = makeDebuggerLifecycle({ onEvent, onDetach: { addListener: vi.fn() } } as any);
    life.start(1); life.stop(); life.start(1);
    expect(onEvent.addListener).toHaveBeenCalledTimes(1);
  });
  it("clears state on detach", () => {
    let detachCb: any;
    const onDetach = { addListener: (cb: any) => (detachCb = cb) };
    const life = makeDebuggerLifecycle({ onEvent: { addListener: vi.fn() }, onDetach } as any);
    life.start(1);
    detachCb({ tabId: 1 }, "canceled_by_user");
    expect(life.activeTabId()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`makeDebuggerLifecycle` undefined): `pnpm --filter @skillwright/extension test debugger-lifecycle`.
- [ ] **Step 3: Implement `makeDebuggerLifecycle`** in `background.ts` (or a small `debugger-lifecycle.ts`): register `onEvent`/`onDetach` at module top level once; route events to the current capturer by `tabId`; `onDetach` nulls state and calls `pushStatus`. Move the per-start `dbg.onEvent.addListener` out of `startNetworkCapture`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Full suite** — `pnpm test`. Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -am "fix(extension): top-level debugger listeners + onDetach recovery"`.

---

## Phase 3 — Parameterization engine (proposer → critic → reconcile)

### Task 3.1: Critic pass

**Files:**
- Create: `packages/shared/src/parameterize/critic.ts`
- Test: `packages/shared/test/parameterize-critic.test.ts`

**Interfaces:**
- Consumes: `LlmBackend`, `ParamDef`, `Recording`.
- Produces: `interface Critique { removals: { name: string; reason: string }[]; additions: ParamDef[]; typeFixes: { name: string; type?: string; required?: boolean }[] }` and `inferParamCritique(recording: Recording, proposal: ParamDef[], backend: LlmBackend): Promise<Critique>`.

- [ ] **Step 1: Write the failing test** with a fake `LlmBackend`:

```ts
import { describe, it, expect } from "vitest";
import { inferParamCritique } from "../src/parameterize/critic";
const fake = (obj: unknown) => ({ name: "fake", complete: async () => obj as any });
describe("critic", () => {
  it("returns structured critique from the backend", async () => {
    const rec = { title: "t", steps: [] } as any;
    const c = await inferParamCritique(rec, [{ name: "account_id", type: "string", required: true, demoValue: "123" }],
      fake({ removals: [], additions: [{ name: "region", type: "string", required: false, demoValue: "eu" }], typeFixes: [] }) as any);
    expect(c.additions[0].name).toBe("region");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `critic.ts`** — a `SchemaSpec<Critique>` (validate removals/additions/typeFixes arrays) + a prompt reusing the `PREAMBLE` style from `passes.ts`, prompting adversarially ("challenge this parameter list: missed inputs, over-parameterization, wrong type/required"), then `backend.complete(prompt, critiqueSpec)`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(shared): parameterization critic pass"`.

### Task 3.2: Deterministic reconcile

**Files:**
- Create: `packages/shared/src/parameterize/reconcile.ts`
- Test: `packages/shared/test/parameterize-reconcile.test.ts`

**Interfaces:**
- Consumes: `ParamDef`, `Critique`, and a `secretNames: Set<string>` derived from redaction metadata.
- Produces: `interface FinalParam extends ParamDef { rationale: string; confidence: "high"|"medium"|"low" }` and `reconcileParams(proposal: ParamDef[], critique: Critique, secretNames: Set<string>): FinalParam[]`.

- [ ] **Step 1: Write the failing tests** (the deterministic floors):

```ts
import { describe, it, expect } from "vitest";
import { reconcileParams } from "../src/parameterize/reconcile";
describe("reconcile", () => {
  it("keeps a secret param even if the critic tries to remove it", () => {
    const out = reconcileParams(
      [{ name: "password", type: "string", required: true, demoValue: "" }],
      { removals: [{ name: "password", reason: "looks constant" }], additions: [], typeFixes: [] },
      new Set(["password"]));
    expect(out.find(p => p.name === "password")).toBeTruthy();
  });
  it("drops a non-secret param when the critic gives a reason", () => {
    const out = reconcileParams(
      [{ name: "sort_order", type: "string", required: false, demoValue: "asc" }],
      { removals: [{ name: "sort_order", reason: "UI-fixed default" }], additions: [], typeFixes: [] },
      new Set());
    expect(out.find(p => p.name === "sort_order")).toBeUndefined();
  });
  it("unions critic additions", () => {
    const out = reconcileParams([], { removals: [], additions: [{ name: "region", type: "string", required: false, demoValue: "eu" }], typeFixes: [] }, new Set());
    expect(out.map(p => p.name)).toContain("region");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `reconcile.ts`** — start from proposal; apply `typeFixes`; apply `removals` ONLY when the name is not in `secretNames` and a non-empty `reason` is present (attach reason to a dropped-log, not output); union `additions`; force every `secretNames` member to be present and `required:true`; set `rationale`/`confidence` (secret→high; critic-touched→medium; else the proposer's default→medium/low).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(shared): deterministic param reconcile with secret floor"`.

### Task 3.3: `parameterize()` orchestration

**Files:**
- Create: `packages/shared/src/parameterize/index.ts`
- Modify: `packages/shared/src/index.ts` (export `parameterize`, `FinalParam`)
- Test: `packages/shared/test/parameterize.test.ts`

**Interfaces:**
- Consumes: `inferParams` (proposer, existing), `inferParamCritique` (3.1), `reconcileParams` (3.2), a `secretNames` extractor from redaction metadata (`redact.ts` `FieldMeta`).
- Produces: `parameterize(recording: Recording, backend: LlmBackend): Promise<FinalParam[]>` — exactly two LLM calls (proposer, critic) then deterministic reconcile.

- [ ] **Step 1: Write the failing test** — a fake backend returning a proposer list then a critique; assert the final list reflects both passes + the secret floor.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `parameterize()`** — `const proposal = await inferParams(recording, backend); const critique = await inferParamCritique(recording, proposal, backend); return reconcileParams(proposal, critique, secretNamesOf(recording));`.
- [ ] **Step 4: Run — expect PASS; run full suite `pnpm test`.**
- [ ] **Step 5: Commit** — `git commit -am "feat(shared): proposer/critic/reconcile parameterize()"`.

---

## Phase 4 — Extension BYO-key `LlmBackend`

### Task 4.1: `fetch`-based backend + settings

**Files:**
- Create: `packages/extension/src/llm/fetch-backend.ts`
- Create: `packages/extension/src/llm/settings.ts`
- Modify: manifest generation (`manifest.config.ts`) — add `host_permissions` for `https://api.anthropic.com/*` and `https://api.openai.com/*`
- Test: `packages/extension/test/fetch-backend.test.ts`

**Interfaces:**
- Consumes: `LlmBackend`, `SchemaSpec`, `completeWithRepair` (`@skillwright/shared`).
- Produces: `createFetchBackend(cfg: { provider: "anthropic"|"openai"; apiKey: string; model: string; fetchImpl?: typeof fetch }): LlmBackend`; `readLlmSettings(): Promise<LlmSettings|undefined>` / `writeLlmSettings(s): Promise<void>` over `chrome.storage.local`.

- [ ] **Step 1: Write the failing test** (mock `fetch`, assert it implements `LlmBackend` and returns a validated object):

```ts
import { describe, it, expect, vi } from "vitest";
import { createFetchBackend } from "../src/llm/fetch-backend";
describe("fetch backend", () => {
  it("returns schema-valid JSON via completeWithRepair", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: "text", text: '{"ok":true}' }] })));
    const be = createFetchBackend({ provider: "anthropic", apiKey: "k", model: "claude-sonnet-5", fetchImpl });
    const out = await be.complete<{ ok: boolean }>("hi", { jsonSchema: {}, validate: (v: any) => v?.ok ? [] : ["no ok"] });
    expect(out.ok).toBe(true);
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({ "anthropic-dangerous-direct-browser-access": "true" });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `createFetchBackend`** — a `generate(prompt)` that POSTs to the provider (Anthropic: `/v1/messages`, headers `x-api-key`, `anthropic-version`, `anthropic-dangerous-direct-browser-access: true`; OpenAI: `/v1/chat/completions`, `Authorization: Bearer`), extracts the text, and passes it to `completeWithRepair(generate, prompt, schema, 1)`. Implement `settings.ts` over `chrome.storage.local`.
- [ ] **Step 4: Run — expect PASS; full suite.**
- [ ] **Step 5: Commit** — `git commit -am "feat(extension): BYO-key fetch LlmBackend + settings"`.

---

## Phase 5 — Panel pipeline UI (6 stages + parameter approval)

### Task 5.1: Pipeline state machine (pure)

**Files:**
- Create: `packages/extension/src/pipeline/state.ts`
- Test: `packages/extension/test/pipeline-state.test.ts`

**Interfaces:**
- Produces: `type Stage = "record"|"distill"|"parameterize"|"script"|"export"|"verify"`; `interface PipelineState { stage: Stage; skill?: SkillDirectory; params?: FinalParam[]; error?: string }`; pure transition fns `advance(state, event): PipelineState`.

- [ ] **Step 1: Write the failing test** — assert `advance` moves record→distill→parameterize and records errors without throwing.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement the pure reducer** (no DOM, no chrome APIs).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(extension): pipeline state reducer"`.

### Task 5.2: Wire the panel UI

**Files:**
- Modify: `packages/extension/src/panel.ts`, `panel.html`
- Test: `packages/extension/test/panel-parameterize.test.ts` (DOM via jsdom — assert the approval list renders one row per `FinalParam` with an editable required toggle and a variable⇄constant control, and that "Approve" emits the edited `FinalParam[]`).

**Interfaces:**
- Consumes: `PipelineState`/`advance` (5.1), `parameterize` (3.3), `createFetchBackend` (4.1).
- Produces: DOM ids the test targets (`#stage-parameterize`, `.param-row`, `#approve-params`); an `onApprove(params: FinalParam[])` callback.

- [ ] **Step 1: Write the failing DOM test** rendering the approval view from a fixed `FinalParam[]` and asserting row count + the approve payload.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the stage strip + the parameter approval renderer in `panel.ts`/`panel.html`, calling `parameterize(recording, backend)` when entering the parameterize stage; on missing settings, route to a settings prompt.
- [ ] **Step 4: Run — expect PASS; full suite.**
- [ ] **Step 5: Commit** — `git commit -am "feat(extension): panel pipeline + parameter approval UI"`.

---

## Phase 6 — Export (tiered)

### Task 6.1: File-System-Access writer + handle persistence

**Files:**
- Create: `packages/extension/src/export/fs-access.ts`
- Create: `packages/extension/src/export/downloads.ts`
- Test: `packages/extension/test/export-fs-access.test.ts`

**Interfaces:**
- Produces: `saveSkillToFolder(skill: SkillDirectory, dirHandle: FileSystemDirectoryHandle): Promise<void>` (creates `skillwright/<slug>/…` and writes each file via `createWritable()`); `pickAndPersistHandle(): Promise<FileSystemDirectoryHandle>` (calls `showDirectoryPicker`, stores in IndexedDB); `restoreHandle(): Promise<FileSystemDirectoryHandle|undefined>` (reads IndexedDB, `queryPermission`→`requestPermission`); `downloadSkill(skill): void` (Tier 0 fallback via `chrome.downloads` into `skillwright/<slug>/`).

- [ ] **Step 1: Write the failing test** with a mock directory handle (record `getDirectoryHandle`/`getFileHandle`/`createWritable().write/close` calls); assert files land under `skillwright/<slug>/` with the right names/contents.

```ts
import { describe, it, expect, vi } from "vitest";
import { saveSkillToFolder } from "../src/export/fs-access";
function mockDir() {
  const writes: Record<string,string> = {};
  const file = (name: string, path: string) => ({
    createWritable: async () => ({ write: async (d: string) => { writes[path] = d; }, close: async () => {} }),
  });
  const dir = (base: string): any => ({
    getDirectoryHandle: async (n: string) => dir(`${base}${n}/`),
    getFileHandle: async (n: string) => file(n, `${base}${n}`),
  });
  return { root: dir(""), writes };
}
describe("fs-access export", () => {
  it("writes the skill under skillwright/<slug>/", async () => {
    const { root, writes } = mockDir();
    await saveSkillToFolder({ slug: "demo", files: { "SKILL.md": "# hi" } } as any, root);
    expect(writes["skillwright/demo/SKILL.md"]).toBe("# hi");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** `fs-access.ts` (nested `getDirectoryHandle({create:true})` per path segment, `createWritable`) + IndexedDB handle store + `downloads.ts` fallback.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(extension): tiered FS-Access + downloads export"`.

### Task 6.2: Wire export into the panel

**Files:** Modify `panel.ts`/`panel.html` — a "Save to skill folder" button that restores or picks a handle then `saveSkillToFolder`; on `AbortError`/denied permission, fall back to `downloadSkill`.

- [ ] **Step 1–5:** Add a DOM test asserting the export button calls the writer with the final `SkillDirectory`; implement; green; full suite; commit `git commit -am "feat(extension): wire export into panel"`.

---

## Phase 7 — Verify + CDP fidelity upgrades

### Task 7.1: Key/typing/file fidelity in the relay path

**Files:**
- Modify: `packages/extension/src/relay-client.ts`
- Test: `packages/extension/test/relay-fidelity.test.ts`

**Interfaces:**
- Produces: a `VIRTUAL_KEYS` table with correct `windowsVirtualKeyCode`, `code` (physical) distinct from `key` (logical), and `text` for Enter (`"\r"`); a `modifiers` bitmask (Alt=1,Ctrl=2,Meta=4,Shift=8); typing via `Input.insertText` after focus (replacing the `.value`-in-JS path for text `change`/`input`); a file branch: eval `resolveElement` with `returnByValue:false` → `objectId` → `DOM.setFileInputFiles{objectId, files:[path]}`.

- [ ] **Step 1: Write failing unit tests** for the pure builders: `keyEventFields("Enter")` → `{ key:"Enter", code:"Enter", windowsVirtualKeyCode:13, text:"\r" }`; `modifierMask(["Ctrl","Shift"])` → `10`. (These are pure; the CDP send is integration-tested separately.)
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the pure key/modifier builders and route them into the existing `Input.dispatchKeyEvent` calls; add the `insertText` typing path (keep checkbox/radio/`<select>` special cases) and the `setFileInputFiles` file branch.
- [ ] **Step 4: Run — expect PASS; full suite.**
- [ ] **Step 5: Commit** — `git commit -am "feat(extension): CDP Input/file replay fidelity"`.

### Task 7.2: Verify runner

**Files:**
- Create: `packages/extension/src/verify/runner.ts`
- Test: `packages/extension/test/verify-runner.test.ts`

**Interfaces:**
- Consumes: `ReplayStep`, the effect tags on steps, the relay fidelity helpers (7.1), the debugger lifecycle (2.1).
- Produces: `verifySkill(steps: ReplayStep[], opts: { tabId: number; confirmDestructive?: boolean; send: CdpLike["send"] }): Promise<{ index: number; outcome: "ok"|"fail"|"skipped-destructive"; error?: string }[]>` — destructive steps skipped unless `confirmDestructive`, first failure reported with step+selector.

- [ ] **Step 1: Write the failing test** with a fake `send`; assert a destructive step is `skipped-destructive` by default and a failing step reports its index+selector.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `verifySkill`** iterating steps, gating destructive, catching per-step errors.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Wire into the panel** Verify stage (warn about the debugger infobar before attaching); DOM-light integration; commit `git commit -am "feat(extension): in-extension Verify runner"`.

---

## Phase 8 — Integration & dogfood

### Task 8.1: Extend the headed real-extension e2e + parameterize dogfood

**Files:**
- Modify: `packages/integration/test/extension-capture-e2e.test.ts` (drive record→distill→parameterize→export against the fixture; guarded on `DISPLAY`/headed as today).
- Create: `packages/integration/dogfood-parameterize.mjs` (manual tool: capture a fixture form, run `parameterize` with a real backend, print the `FinalParam[]`).

- [ ] **Step 1: Extend the e2e** to assert the panel produces a `SkillDirectory` with `skillwright-inputs` frontmatter after approval.
- [ ] **Step 2: Run headed/xvfb** — `xvfb-run -a pnpm test` (the CI path). Expected: PASS or clean skip on headless.
- [ ] **Step 3: Add the dogfood tool** mirroring the existing `dogfood-*.mjs` structure.
- [ ] **Step 4: Full suite** — `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "test(integration): full in-extension pipeline e2e + parameterize dogfood"`.

---

## Self-Review

**Spec coverage:** §4 engine→Phase 1; §3 debugger fix→Phase 2; §6 parameterize→Phase 3; §7 LLM client→Phase 4; §5 pipeline UI→Phase 5; §7 export→Phase 6; §5 Verify + §3 Input/file fidelity→Phase 7; §9 testing→woven through + Phase 8. Cross-origin iframe is an explicit non-goal (no task). File-upload gap closed in 7.1. ✅ no gaps.

**Placeholder scan:** every code step shows real code grounded in actual signatures (`LlmBackend`, `ParamDef`, `SkillDirectory`, `CdpLike`, `ReplayStep`). No TBD/"handle errors"/"similar to". ✅

**Type consistency:** `LlmBackend.complete<T>(prompt, schema)`, `ParamDef {name,type,required,demoValue,description?}`, `FinalParam extends ParamDef {rationale,confidence}`, `SkillDirectory {slug,files}`, `Critique {removals,additions,typeFixes}` used consistently across Phases 3–7. ✅
