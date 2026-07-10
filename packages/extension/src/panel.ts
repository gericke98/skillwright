/** Side panel controller — thin UI over the background worker's state. */
import type { Recording } from "@skillwright/shared";
import { parameterize } from "@skillwright/shared";
import type { PanelMessage, StatusMessage, SavedRecordingMessage, RelayStatusMessage } from "./messages";
import { advance, initialState, type PipelineState } from "./pipeline/state";
import { renderStages } from "./pipeline/stage-view";
import { renderParamApproval } from "./pipeline/param-view";
import { readLlmSettings } from "./llm/settings";
import { createFetchBackend } from "./llm/fetch-backend";

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
// Pipeline strip + parameter-approval view (Task 5.2). Rendering itself lives
// in pipeline/stage-view.ts + pipeline/param-view.ts (pure, unit-tested);
// panel.ts only holds the PipelineState, calls advance(), and delegates to
// those renderers. Distill orchestration (recording -> SkillDirectory) is not
// wired here — out of this task's scope (not in its consumed interfaces) — so
// the strip currently advances record -> distill and then waits; a later
// task's "distilled" event will carry it into "parameterize", which is fully
// wired below.
const stagesEl = document.getElementById("stages") as HTMLDivElement;
const parameterizeEl = document.getElementById("stage-parameterize") as HTMLDivElement;

let pipeline: PipelineState = initialState();
let parameterizeStarted = false;

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
  const enteringParameterize = next.stage === "parameterize" && pipeline.stage !== "parameterize";
  pipeline = next;
  renderStages(stagesEl, pipeline.stage, pipeline.error);
  if (pipeline.stage !== "parameterize") {
    parameterizeStarted = false;
    parameterizeEl.innerHTML = "";
  } else if (enteringParameterize && !parameterizeStarted && pipeline.recording) {
    parameterizeStarted = true;
    void runParameterizeStage(pipeline.recording);
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
