import { classifyStepEffect, type Recording } from "@skillwright/shared";
import type { ReplayStep } from "./replay";

/**
 * Convert a recording into the flat ReplayStep[] the run loop consumes: take
 * the primary selector of each selector group, carry effect/value/url, and
 * classify effect if a step somehow lacks one (defensive — capture normally
 * sets it).
 */
export function toReplaySteps(recording: Recording): ReplayStep[] {
  return recording.steps.map((step) => {
    const selectors = (step.selectors ?? []).map((group) => group[0]).filter((s): s is string => !!s);
    const effect = step.effect ?? classifyStepEffect({ action: step.type, label: selectors[0] });
    const out: ReplayStep = { type: step.type, effect, selectors };
    if (typeof step.value === "string") out.value = step.value;
    if (typeof step.url === "string") out.url = step.url;
    return out;
  });
}
