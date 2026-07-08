import { roundUpEffect } from "./effect";
import type { CapturedRequest, EffectTag, Step } from "./schema";

/**
 * Map an HTTP method to the effect it proves. Read methods are readonly; writes
 * are mutating; DELETE is destructive. An UNKNOWN method rounds up to
 * destructive — we never assume an unrecognized verb is safe (round-up rule).
 */
function methodEffect(method: string): EffectTag {
  switch (method.toUpperCase()) {
    case "GET":
    case "HEAD":
    case "OPTIONS":
      return "readonly";
    case "POST":
    case "PUT":
    case "PATCH":
      return "mutating";
    case "DELETE":
      return "destructive";
    default:
      return roundUpEffect([]); // unknown → destructive
  }
}

/**
 * Ground-truth effect for a step from the network calls it triggered: the most
 * severe method wins. Returns undefined when there are no requests, so it
 * contributes nothing to the fusion rather than forcing a value.
 */
export function deriveNetworkEffect(requests: CapturedRequest[]): EffectTag | undefined {
  if (requests.length === 0) return undefined;
  return roundUpEffect(requests.map((r) => methodEffect(r.method)));
}

/**
 * Attribute each observed request to the step that triggered it: the most recent
 * step at-or-before the request's timestamp, within `windowMs`. Steps without a
 * timestamp receive nothing. Over-attribution biases toward more severe tags —
 * the safe direction. Returns steps with `requests` populated (input untouched).
 */
export function correlateRequests(
  steps: Step[],
  network: CapturedRequest[],
  windowMs = 1500,
): Step[] {
  const out: Step[] = steps.map((s) => ({ ...s, requests: [] as CapturedRequest[] }));
  for (const request of network) {
    let bestIndex = -1;
    let bestTime = -Infinity;
    for (let i = 0; i < out.length; i++) {
      const t = out[i]!.timestamp;
      if (typeof t !== "number") continue;
      if (t <= request.timestamp && request.timestamp - t <= windowMs && t > bestTime) {
        bestIndex = i;
        bestTime = t;
      }
    }
    if (bestIndex >= 0) out[bestIndex]!.requests!.push(request);
  }
  return out;
}
