import type { Step } from "@bskill/shared";

/** content script → background */
export type CaptureMessage =
  | { kind: "step"; step: Step }
  | { kind: "navigation"; url: string }
  | { kind: "recstate-query" };

/** background → content script: reply to a recstate-query. */
export interface RecStateReply {
  recording: boolean;
}

/** side panel → background */
export type PanelMessage =
  | { kind: "start"; title: string }
  | { kind: "stop" }
  | { kind: "status" }
  | { kind: "connectRelay"; port: number; token: string };

/** background → side panel: relay connection status. */
export interface RelayStatusMessage {
  kind: "relaystatus";
  status: string;
}

/** background → side panel (reply / broadcast) */
export interface StatusMessage {
  kind: "status";
  recording: boolean;
  stepCount: number;
}

/** background → content scripts */
export interface RecStateMessage {
  kind: "recstate";
  recording: boolean;
}

/** background → side panel: a finished recording to save (Blob download in the
 *  panel's window context — reliable filename, unlike a service-worker data URL). */
export interface SavedRecordingMessage {
  kind: "recording";
  filename: string;
  json: string;
}

export type ToBackground = CaptureMessage | PanelMessage;
