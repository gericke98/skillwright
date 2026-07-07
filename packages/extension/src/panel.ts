/** Side panel controller — thin UI over the background worker's state. */
import type { PanelMessage, StatusMessage } from "./messages";

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

// Live status pushes from the background.
chrome.runtime.onMessage.addListener((msg: StatusMessage) => {
  if (msg?.kind === "status") render(msg);
});

// Initial state.
send({ kind: "status" }).then((s) => s && render(s));
