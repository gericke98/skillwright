/**
 * Content script — the thin capture shell. All real logic lives in the tested
 * `buildCaptureStep`; this only wires capture-phase DOM listeners to it and
 * forwards steps to the background worker. Honors R2: captures nothing until the
 * background says a recording is active.
 */
import { buildCaptureStep, eventTarget } from "./capture";
import type { CaptureMessage, RecStateMessage, RecStateReply } from "./messages";

let recording = false;

chrome.runtime.onMessage.addListener((msg: RecStateMessage) => {
  if (msg?.kind === "recstate") recording = msg.recording;
});

// A page loaded after recording started never receives the start broadcast, so
// pull the current state on load (handles record-then-navigate).
chrome.runtime
  .sendMessage({ kind: "recstate-query" } satisfies CaptureMessage)
  .then((reply: RecStateReply | undefined) => {
    if (reply) recording = reply.recording;
  })
  .catch(() => {
    /* background asleep; a later recstate broadcast will set it */
  });

function send(msg: CaptureMessage): void {
  chrome.runtime.sendMessage(msg).catch(() => {
    /* background asleep between events; harmless */
  });
}

function onEvent(action: string) {
  return (event: Event) => {
    if (!recording) return;
    // composedPath()[0] is the real element inside a shadow root (event.target
    // would be the retargeted host).
    const target = eventTarget(event);
    if (!target) return;
    try {
      send({ kind: "step", step: buildCaptureStep(target, action) });
    } catch {
      /* never let capture break the page */
    }
  };
}

// Capture phase so we observe the interaction before the page's own handlers.
document.addEventListener("click", onEvent("click"), true);
document.addEventListener("change", onEvent("change"), true);

// Navigations are reported by the background via webNavigation; nothing to do
// here for them. Keydown/scroll coalescing lands with richer capture later.
