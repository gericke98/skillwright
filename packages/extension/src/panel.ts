/** Side panel controller — thin UI over the background worker's state. */
import type { PanelMessage, StatusMessage, SavedRecordingMessage } from "./messages";

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

// Live status pushes + the finished-recording download from the background.
chrome.runtime.onMessage.addListener((msg: StatusMessage | SavedRecordingMessage) => {
  if (msg?.kind === "status") render(msg);
  else if (msg?.kind === "recording") downloadRecording(msg);
});

// Initial state.
send({ kind: "status" }).then((s) => s && render(s));
