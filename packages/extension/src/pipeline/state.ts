import type { FinalParam, Recording, SkillDirectory } from "@skillwright/shared";

/**
 * The 6 stages of the in-extension pipeline, in order. `advance` only ever
 * moves forward one stage per successful event (or stays put on failure/no-op).
 */
export type Stage = "record" | "distill" | "parameterize" | "script" | "export" | "verify";

export interface PipelineState {
  stage: Stage;
  recording?: Recording;
  skill?: SkillDirectory;
  params?: FinalParam[];
  error?: string;
}

export type PipelineEvent =
  | { kind: "recorded"; recording: Recording }
  | { kind: "distilled"; skill: SkillDirectory }
  | { kind: "parameterized"; params: FinalParam[] }
  | { kind: "scripted"; skill: SkillDirectory }
  | { kind: "exported" }
  | { kind: "verified" }
  | { kind: "failed"; error: string }
  | { kind: "reset" };

export function initialState(): PipelineState {
  return { stage: "record" };
}

/**
 * Pure, total state transition function for the pipeline.
 *
 * Semantics:
 * - PURE + IMMUTABLE: never mutates `state`; always returns a new object.
 * - NEVER THROWS: every event is handled, including out-of-order ones.
 * - `failed` records `error` and KEEPS the current stage (retry-in-place).
 * - Any event that successfully advances the stage clears a stale `error`.
 * - OUT-OF-ORDER events (an event whose required current stage doesn't match
 *   `state.stage`) are treated as a no-op: the returned state is a shallow
 *   copy with the same stage/payloads/error as the input — nothing is
 *   cleared, nothing advances. This is the "ignored" choice from the two
 *   allowed by the spec (vs. "unchanged but error cleared"), because an
 *   out-of-order event is not a success for the stage the UI is actually in;
 *   clearing a real error on a no-op would hide a failure the user hasn't
 *   retried yet.
 * - `reset` always returns `initialState()`, regardless of current stage.
 * - Payloads accumulate: `recording`, `skill`, and `params` set by earlier
 *   stages are preserved by later transitions, except `scripted`, which
 *   REPLACES `skill` with the script-bearing SkillDirectory.
 */
export function advance(state: PipelineState, event: PipelineEvent): PipelineState {
  switch (event.kind) {
    case "reset":
      return initialState();

    case "failed":
      return { ...state, error: event.error };

    case "recorded":
      if (state.stage !== "record") return { ...state };
      return { ...withoutError(state), stage: "distill", recording: event.recording };

    case "distilled":
      if (state.stage !== "distill") return { ...state };
      return { ...withoutError(state), stage: "parameterize", skill: event.skill };

    case "parameterized":
      if (state.stage !== "parameterize") return { ...state };
      return { ...withoutError(state), stage: "script", params: event.params };

    case "scripted":
      if (state.stage !== "script") return { ...state };
      return { ...withoutError(state), stage: "export", skill: event.skill };

    case "exported":
      if (state.stage !== "export") return { ...state };
      return { ...withoutError(state), stage: "verify" };

    case "verified":
      if (state.stage !== "verify") return { ...state };
      return { ...withoutError(state), stage: "verify" };

    default:
      return { ...state };
  }
}

function withoutError(state: PipelineState): PipelineState {
  const { error: _error, ...rest } = state;
  return rest;
}
