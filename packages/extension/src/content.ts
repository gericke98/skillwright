/**
 * Content script — the thin capture shell. All real logic lives in the tested
 * `buildCaptureStep`; this only wires capture-phase DOM listeners to it and
 * forwards steps to the background worker. Honors R2: captures nothing until the
 * background says a recording is active.
 */
import { buildCaptureStep, eventTarget, shouldCaptureKey } from "./capture";
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

function onKeydown(event: KeyboardEvent): void {
  if (!recording) return;
  if (!shouldCaptureKey(event)) return; // skip plain typing (captured via change)
  const target = eventTarget(event);
  if (!target) return;
  try {
    send({ kind: "step", step: buildCaptureStep(target, "keydown", undefined, event.key, event) });
  } catch {
    /* never let capture break the page */
  }
}

// Contenteditable rich-text editors (Gmail/Slack/Notion) fire `input`, not
// `change`, so the change listener never sees them. Capture their final text
// when focus leaves the editor. Regular form controls already emit `change`, so
// only editing hosts are handled here (avoids duplicate steps).
function onEditableBlur(event: FocusEvent): void {
  if (!recording) return;
  const target = eventTarget(event);
  if (!target || !(target as HTMLElement).isContentEditable) return;
  try {
    send({ kind: "step", step: buildCaptureStep(target, "change") });
  } catch {
    /* never let capture break the page */
  }
}

// Capture phase so we observe the interaction before the page's own handlers.
document.addEventListener("click", onEvent("click"), true);
document.addEventListener("change", onEvent("change"), true);
document.addEventListener("keydown", onKeydown, true);
document.addEventListener("focusout", onEditableBlur, true);

// Navigations are reported by the background via webNavigation; nothing to do
// here for them. Keydown/scroll coalescing lands with richer capture later.
