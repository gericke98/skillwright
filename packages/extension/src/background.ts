/**
 * Background service worker — the recording state hub. Owns a RecordingSession
 * (tested) and relays messages between the side panel and content scripts.
 * Broadcasts recording state to tabs so content scripts capture only while
 * active, and hands the finished recording to a download on stop.
 */
import { NetworkCapturer } from "@skillwright/shared";
import { RecordingSession } from "./session";
import { makeDebuggerLifecycle, type DebuggerLifecycleDbg } from "./debugger-lifecycle";
import { connectRelay } from "./relay-client";
import type {
  PanelMessage,
  CaptureMessage,
  StatusMessage,
  RecStateMessage,
  SavedRecordingMessage,
  RelayStatusMessage,
} from "./messages";

const session = new RecordingSession();
let relaySocket: WebSocket | undefined;

// Capture v2: a passive network observer attached to the recorded tab, so the
// distiller gets network-truth effect evidence. Best-effort — recording works
// without it if attaching the debugger fails.
let netCapturer: NetworkCapturer | undefined;

// Registered exactly ONCE at module scope — not per recording — so the
// chrome.debugger onEvent/onDetach listeners never leak across start/stop
// cycles, and so they're still wired after an MV3 service-worker restart
// (this top-level code reruns on every wake, unlike listeners that were
// previously registered from inside the async startNetworkCapture()). On
// onDetach (DevTools opened on the tab, the debuggee infobar dismissed, tab
// closed, etc.) it clears state and we push a status so the panel reflects
// that network capture recovered rather than silently dying mid-recording.
const debuggerLifecycle = chrome.debugger
  ? makeDebuggerLifecycle(chrome.debugger as unknown as DebuggerLifecycleDbg, () => {
      netCapturer = undefined;
      pushStatus();
    })
  : undefined;

async function startNetworkCapture(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null || !chrome.debugger || !debuggerLifecycle) return;
    await chrome.debugger.attach({ tabId: tab.id }, "1.3");
    const cdp = debuggerLifecycle.start(tab.id);
    netCapturer = new NetworkCapturer();
    await netCapturer.attach(cdp);
  } catch {
    netCapturer = undefined;
    debuggerLifecycle?.stop();
  }
}

/** Drain observed requests into the session (while still recording) so stop()
 * can correlate them to steps. */
function drainNetworkCapture(): void {
  if (netCapturer) for (const r of netCapturer.collected()) session.recordRequest(r);
}

async function stopNetworkCapture(): Promise<void> {
  netCapturer = undefined;
  const tabId = debuggerLifecycle?.activeTabId();
  debuggerLifecycle?.stop();
  if (tabId != null && chrome.debugger) {
    try {
      await chrome.debugger.detach({ tabId });
    } catch {
      /* already detached */
    }
  }
}

function relayStatus(status: string): void {
  const msg: RelayStatusMessage = { kind: "relaystatus", status };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

async function startRelay(port: number, token: string): Promise<void> {
  relaySocket?.close();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) {
    relayStatus("error: no active tab");
    return;
  }
  try {
    relaySocket = await connectRelay(port, token, tab.id, relayStatus);
  } catch (e) {
    relayStatus(`error: ${String(e)}`);
  }
}

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

function saveRecording(recording: unknown, title: string): void {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "recording";
  const msg: SavedRecordingMessage = {
    kind: "recording",
    filename: `${slug}.recording.json`,
    json: JSON.stringify(recording, null, 2),
  };
  // The side panel performs the actual Blob download (reliable filename).
  chrome.runtime.sendMessage(msg).catch(() => {});
}

chrome.runtime.onMessage.addListener(
  (msg: PanelMessage | CaptureMessage, _sender, sendResponse) => {
    switch (msg.kind) {
      case "start":
        session.start(msg.title);
        void startNetworkCapture();
        broadcastRecState(true);
        pushStatus();
        break;
      case "stop":
        if (session.isRecording) {
          drainNetworkCapture();
          const rec = session.stop();
          void stopNetworkCapture();
          broadcastRecState(false);
          saveRecording(rec, rec.title);
          pushStatus();
        }
        break;
      case "status":
        sendResponse(status());
        return true;
      case "recstate-query":
        sendResponse({ recording: session.isRecording });
        return true;
      case "connectRelay":
        void startRelay(msg.port, msg.token);
        break;
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
