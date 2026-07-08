import {
  classifyStepEffect,
  deriveNetworkEffect,
  roundUpEffect,
  type Recording,
} from "@skillwright/shared";
import type { ReplayStep } from "./replay";

/**
 * Convert a recording into the flat ReplayStep[] the run loop consumes: take
 * the primary selector of each selector group, carry effect/value/url, and
 * classify effect if a step somehow lacks one (defensive — capture normally
 * sets it). Network truth (the HTTP method the step fired) can only raise severity.
 */
export function toReplaySteps(recording: Recording): ReplayStep[] {
  return recording.steps.map((step) => {
    const selectors = (step.selectors ?? []).map((group) => group[0]).filter((s): s is string => !!s);
    const base = step.effect ?? classifyStepEffect({ action: step.type, label: selectors[0] });
    const network = deriveNetworkEffect(step.requests ?? []);
    const effect = network ? roundUpEffect([base, network]) : base;
    const out: ReplayStep = { type: step.type, effect, selectors };
    if (typeof step.value === "string") out.value = step.value;
    if (typeof step.url === "string") out.url = step.url;
    return out;
  });
}
