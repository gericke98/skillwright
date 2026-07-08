import type { EffectTag } from "@skillwright/shared";

export type GateDecision = "proceed" | "confirm" | "halt";

export interface GateContext {
  /** The user passed --confirm-destructive (or confirmed interactively). */
  confirmDestructive: boolean;
  /** "initial" = tier-1/2 replay; "heal" = tier-3 agentic recovery. */
  phase: "initial" | "heal";
  /** The failing step may have already partially executed (e.g. the click
   *  landed but a follow-up assertion failed). Only meaningful during a heal. */
  partiallyExecuted: boolean;
}

/**
 * Decide whether a step may run. Load-bearing safety control (§6.2):
 *
 *   - "halt"    → stop the run, emit the failure report; never execute.
 *   - "confirm" → require explicit confirmation before executing.
 *   - "proceed" → safe to execute.
 *
 * The order of checks matters: the heal-partial-execution guard is checked
 * FIRST so it can never be bypassed by a confirmation flag — re-running a
 * mutating-or-destructive step that may have already fired is the double-send
 * failure this gate exists to prevent.
 */
export function gateStep(effect: EffectTag, ctx: GateContext): GateDecision {
  if (ctx.phase === "heal" && ctx.partiallyExecuted && effect !== "readonly") {
    return "halt";
  }
  if (effect === "destructive" && !ctx.confirmDestructive) {
    return "confirm";
  }
  return "proceed";
}
