/**
 * Background service worker — the recording state hub. Owns a RecordingSession
 * (tested) and relays messages between the side panel and content scripts.
 * Broadcasts recording state to tabs so content scripts capture only while
 * active, and hands the finished recording to a download on stop.
 */
import { RecordingSession } from "./session";
import type { PanelMessage, CaptureMessage, StatusMessage, RecStateMessage } from "./messages";

const session = new RecordingSession();

function broadcastRecState(recording: boolean): void {
  const msg: RecStateMessage = { kind: "recstate", recording };
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id != null) chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
  });
}

function status(): StatusMessage {
  return { kind: "status", recording: session.isRecording, stepCount: session.stepCount };
}

function pushStatus(): void {
  chrome.runtime.sendMessage(status()).catch(() => {});
}

function downloadRecording(recording: unknown, title: string): void {
  const json = JSON.stringify(recording, null, 2);
  const dataUrl = "data:application/json;charset=utf-8," + encodeURIComponent(json);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "recording";
  chrome.downloads.download({ url: dataUrl, filename: `${slug}.recording.json`, saveAs: true });
}

chrome.runtime.onMessage.addListener(
  (msg: PanelMessage | CaptureMessage, _sender, sendResponse) => {
    switch (msg.kind) {
      case "start":
        session.start(msg.title);
        broadcastRecState(true);
        pushStatus();
        break;
      case "stop":
        if (session.isRecording) {
          const rec = session.stop();
          broadcastRecState(false);
          downloadRecording(rec, rec.title);
          pushStatus();
        }
        break;
      case "status":
        sendResponse(status());
        return true;
      case "step":
        if (session.isRecording) {
          session.addStep(msg.step);
          pushStatus();
        }
        break;
      case "navigation":
        if (session.isRecording) {
          session.addNavigation(msg.url);
          pushStatus();
        }
        break;
    }
    return undefined;
  },
);

// Record top-frame navigations while active.
chrome.webNavigation?.onCommitted.addListener((details) => {
  if (details.frameId === 0 && session.isRecording) {
    session.addNavigation(details.url);
    pushStatus();
  }
});

// Open the side panel when the toolbar icon is clicked.
chrome.action?.onClicked.addListener((tab) => {
  if (tab.windowId != null) chrome.sidePanel?.open({ windowId: tab.windowId }).catch(() => {});
});
