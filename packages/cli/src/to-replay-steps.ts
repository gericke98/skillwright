import {
  classifyStepEffect,
  deriveNetworkEffect,
  EFFECT_SEVERITY,
  roundUpEffect,
  type CapturedRequest,
  type Recording,
} from "@skillwright/shared";
import type { ReplayStep, StepRequest } from "./replay";

/** The state-changing request a step is best replayed AS: the most-severe method
 * (a DELETE/POST beats the incidental GETs a click also triggers). */
function primaryRequest(requests: CapturedRequest[] | undefined): StepRequest | undefined {
  if (!requests || requests.length === 0) return undefined;
  const severity = (r: CapturedRequest) => {
    const eff = deriveNetworkEffect([r]);
    return eff ? EFFECT_SEVERITY.indexOf(eff) : 0;
  };
  const best = requests.reduce((a, b) => (severity(b) > severity(a) ? b : a));
  const req: StepRequest = { method: best.method, url: best.url };
  if (typeof best.body === "string") req.body = best.body;
  return req;
}

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
    const request = primaryRequest(step.requests);
    if (request) out.request = request;
    return out;
  });
}
