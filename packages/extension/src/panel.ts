/** Side panel controller — thin UI over the background worker's state. */
import type { Recording } from "@skillwright/shared";
import { applyParamsToSkill, parameterize } from "@skillwright/shared";
import type { PanelMessage, StatusMessage, SavedRecordingMessage, RelayStatusMessage } from "./messages";
import { advance, initialState, type PipelineState } from "./pipeline/state";
import { renderStages } from "./pipeline/stage-view";
import { renderParamApproval } from "./pipeline/param-view";
import { readLlmSettings } from "./llm/settings";
import { createFetchBackend } from "./llm/fetch-backend";
import { runDistill } from "./pipeline/run-distill";

/** Save a finished recording as a file with a proper name (panel has a window). */
function downloadRecording(msg: SavedRecordingMessage): void {
  const blob = new Blob([msg.json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = msg.filename;
  a.click();
  URL.revokeObjectURL(url);
}

const taskName = document.getElementById("task-name") as HTMLInputElement;
const toggle = document.getElementById("toggle") as HTMLButtonElement;
const count = document.getElementById("count") as HTMLSpanElement;
const live = document.getElementById("live") as HTMLSpanElement;

let recording = false;

function send(msg: PanelMessage): Promise<StatusMessage | undefined> {
  return chrome.runtime.sendMessage(msg).catch(() => undefined);
}

function render(s: StatusMessage): void {
  recording = s.recording;
  count.textContent = String(s.stepCount);
  toggle.textContent = recording ? "Stop recording" : "Start recording";
  toggle.classList.toggle("recording", recording);
  taskName.disabled = recording;
  live.textContent = recording ? "●" : "";
  live.className = recording ? "dot" : "";
}

toggle.addEventListener("click", async () => {
  if (recording) {
    await send({ kind: "stop" });
  } else {
    await send({ kind: "start", title: taskName.value.trim() || "Untitled task" });
  }
});

// Relay pairing controls.
const relayPort = document.getElementById("relay-port") as HTMLInputElement;
const relayToken = document.getElementById("relay-token") as HTMLInputElement;
const relayConnect = document.getElementById("relay-connect") as HTMLButtonElement;
const relayStatus = document.getElementById("relay-status") as HTMLSpanElement;

relayConnect.addEventListener("click", () => {
  const port = Number(relayPort.value) || 9333;
  const token = relayToken.value.trim();
  if (!token) {
    relayStatus.textContent = "enter the token from skillwright run";
    return;
  }
  void send({ kind: "connectRelay", port, token });
  relayStatus.textContent = "connecting…";
});

// ---------------------------------------------------------------------------
// Pipeline strip + parameter-approval view (Task 5.2/5.3). Rendering itself
// lives in pipeline/stage-view.ts + pipeline/param-view.ts (pure,
// unit-tested); panel.ts only holds the PipelineState, calls advance(), and
// delegates to those renderers. Distill orchestration itself
// (recording -> SkillDirectory, with zero-LLM fallback) lives in the
// unit-tested pipeline/run-distill.ts; panel.ts only wires it to the stage
// transition and DOM below.
const stagesEl = document.getElementById("stages") as HTMLDivElement;
const distillNoticeEl = document.getElementById("distill-notice") as HTMLDivElement;
const parameterizeEl = document.getElementById("stage-parameterize") as HTMLDivElement;

let pipeline: PipelineState = initialState();
let distillStarted = false;
let parameterizeStarted = false;

/** Non-fatal notice for the zero-LLM degraded path: never blocks the
 * pipeline, never prints the raw provider error as the primary message, and
 * only ever sets text via `textContent` — `llmError` is provider-authored
 * text and must never be interpreted as HTML. */
function renderDistillNotice(llmError: string): void {
  distillNoticeEl.innerHTML = "";
  const primary = document.createElement("p");
  primary.className = "stage-notice";
  primary.textContent =
    "This skill was compiled without AI assistance. Add an API key in settings for richer step descriptions.";
  distillNoticeEl.appendChild(primary);
  const detail = document.createElement("p");
  detail.className = "stage-notice-detail";
  detail.textContent = llmError;
  distillNoticeEl.appendChild(detail);
}

async function runDistillStage(recordingToDistill: Recording): Promise<void> {
  distillNoticeEl.innerHTML = "";
  const settings = await readLlmSettings();
  const backend = settings ? createFetchBackend(settings) : undefined;
  const result = await runDistill(recordingToDistill, backend);
  if (!result.usedLlm && result.llmError) {
    // Degraded path is NON-FATAL: surface a notice, but still advance with
    // the zero-LLM skill so parameterize runs next — never fire `failed`.
    renderDistillNotice(result.llmError);
  }
  setPipeline(advance(pipeline, { kind: "distilled", skill: result.skill }));
}

async function runParameterizeStage(recordingToParameterize: Recording): Promise<void> {
  parameterizeEl.innerHTML = "";
  const settings = await readLlmSettings();
  if (!settings) {
    const prompt = document.createElement("p");
    prompt.className = "settings-prompt";
    prompt.textContent = "Configure an LLM provider + API key in settings before parameterizing.";
    parameterizeEl.appendChild(prompt);
    return;
  }

  const backend = createFetchBackend(settings);
  try {
    const params = await parameterize(recordingToParameterize, backend);
    renderParamApproval(parameterizeEl, params, {
      onApprove: (edited) => {
        setPipeline(advance(pipeline, { kind: "parameterized", params: edited }));
      },
    });
  } catch (e) {
    setPipeline(advance(pipeline, { kind: "failed", error: e instanceof Error ? e.message : String(e) }));
  }
}

function setPipeline(next: PipelineState): void {
  const enteringDistill = next.stage === "distill" && pipeline.stage !== "distill";
  const enteringParameterize = next.stage === "parameterize" && pipeline.stage !== "parameterize";
  const enteringScript = next.stage === "script" && pipeline.stage !== "script";
  pipeline = next;
  renderStages(stagesEl, pipeline.stage, pipeline.error);
  if (pipeline.stage !== "distill") {
    distillStarted = false;
  } else if (enteringDistill && !distillStarted && pipeline.recording) {
    distillStarted = true;
    void runDistillStage(pipeline.recording);
  }
  if (pipeline.stage !== "parameterize") {
    parameterizeStarted = false;
    parameterizeEl.innerHTML = "";
  } else if (enteringParameterize && !parameterizeStarted && pipeline.recording) {
    parameterizeStarted = true;
    void runParameterizeStage(pipeline.recording);
  }
  // Script stage is synchronous: bake the approved params into the artifact
  // (skillwright-inputs frontmatter) and advance. Deferred to a microtask so
  // the re-entrant setPipeline runs after this one has fully finished.
  if (enteringScript && pipeline.skill && pipeline.params) {
    const { skill, params } = pipeline;
    queueMicrotask(() => {
      setPipeline(advance(pipeline, { kind: "scripted", skill: applyParamsToSkill(skill, params) }));
    });
  }
}

setPipeline(pipeline);

/** Parse a finished recording's JSON and feed it into the pipeline reducer. A
 * parse failure becomes a `failed` event rather than throwing — the message
 * arrives over `chrome.runtime`, which is untyped at the wire. */
function onRecordingSaved(msg: SavedRecordingMessage): void {
  try {
    const parsed = JSON.parse(msg.json) as Recording;
    setPipeline(advance(pipeline, { kind: "recorded", recording: parsed }));
  } catch (e) {
    setPipeline(advance(pipeline, { kind: "failed", error: e instanceof Error ? e.message : String(e) }));
  }
}

// Live status pushes, the finished-recording download (+ pipeline feed), and
// relay status.
chrome.runtime.onMessage.addListener(
  (msg: StatusMessage | SavedRecordingMessage | RelayStatusMessage) => {
    if (msg?.kind === "status") render(msg);
    else if (msg?.kind === "recording") {
      downloadRecording(msg);
      onRecordingSaved(msg);
    } else if (msg?.kind === "relaystatus") relayStatus.textContent = msg.status;
  },
);

// Initial state.
send({ kind: "status" }).then((s) => s && render(s));
