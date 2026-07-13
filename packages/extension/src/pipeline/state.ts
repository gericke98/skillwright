import type { FinalParam, Recording, SkillDirectory } from "@skillwright/shared";

/**
 * The 6 stages of the in-extension pipeline, in order. `advance` only ever
 * moves forward one stage per successful event (or stays put on failure/no-op).
 */
export type Stage = "record" | "distill" | "parameterize" | "script" | "export" | "verify";

export interface PipelineState {
  stage: Stage;
  /**
   * Deliberate extension beyond the brief's literal interface text: the
   * recording must flow forward so it's available to `distill()` in later
   * pipeline stages.
   */
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
 *
 * Defensive boundary: `state` and `event` are typed, but in practice `event`
 * arrives over `chrome.runtime` messaging, which is untyped at the wire. A
 * malformed/missing `state` or `event` must never throw — it's treated as
 * a no-op (or reset to `initialState()` for a malformed `state`) rather than
 * crashing the panel.
 */
export function advance(state: PipelineState, event: PipelineEvent): PipelineState {
  if (typeof state !== "object" || state === null) {
    return initialState();
  }
  if (typeof event !== "object" || event === null || typeof (event as { kind?: unknown }).kind !== "string") {
    return { ...state };
  }

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
      // Same-stage confirmation event, not a transition: `exported` already
      // advances export -> verify. `verified` exists so a retry after a
      // failed verify can clear the stale error without a full `reset`
      // (Verify is an OPTIONAL side-action per the design doc, not a gate).
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
