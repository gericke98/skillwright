import type { Step } from "@bskill/shared";

/** content script → background */
export type CaptureMessage =
  | { kind: "step"; step: Step }
  | { kind: "navigation"; url: string };

/** side panel → background */
export type PanelMessage =
  | { kind: "start"; title: string }
  | { kind: "stop" }
  | { kind: "status" };

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

export type ToBackground = CaptureMessage | PanelMessage;
