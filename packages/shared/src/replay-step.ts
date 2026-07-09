import type { EffectTag } from "./schema";

/** The captured HTTP request a step can be replayed AS (API-replay mode). */
export interface StepRequest {
  method: string;
  url: string;
  body?: string;
}

export interface ReplayStep {
  type: string;
  effect: EffectTag;
  /** Ordered selector alternatives, most stable first. */
  selectors: string[];
  /** For value actions (change/input): the value to enter (post-parameter). */
  value?: string;
  /** For navigate steps: the (redacted) destination URL. */
  url?: string;
  /** For keydown steps: the key to press (e.g. "Enter"). */
  key?: string;
  /** The primary network call this step fired — enables API-replay. */
  request?: StepRequest;
}
