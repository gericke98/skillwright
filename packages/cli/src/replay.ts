import type { EffectTag, ReplayStep, StepRequest } from "@skillwright/shared";
import { gateStep } from "./safety-gate";

// Re-exported for this module's own consumers (bin.ts et al import these from
// here as well as from @skillwright/shared).
export type { ReplayStep, StepRequest };

/**
 * Outcome of attempting a step with one selector:
 *   - "ok"      → the action fired and its postcondition held.
 *   - "fail"    → a clean miss; the selector didn't match, nothing fired.
 *   - "partial" → the action MAY have fired but its postcondition failed (e.g.
 *                 the click dispatched but the row didn't disappear). For a
 *                 mutating/destructive step this is the double-send hazard, so
 *                 the run loop stops trying selectors and never heals it.
 */
export type StepOutcome = "ok" | "fail" | "partial";

/** A live page view handed to the healer: ARIA tree + current URL. */
export interface PageSnapshot {
  url: string;
  aria: string;
}

/**
 * Abstracts "try to perform this step using this one selector" against a live
 * page. The real implementation drives Playwright over CDP; tests inject a fake.
 * `snapshot()` is optional and only needed for tier-3 heal. Keeping this an
 * interface is what makes the run loop (and its safety-gate integration)
 * testable without a browser.
 */
export interface StepDriver {
  execute(step: ReplayStep, selector: string): Promise<StepOutcome>;
  snapshot?(): Promise<PageSnapshot>;
  /** Re-execute a step's captured request against the live authenticated session
   * (API-replay). Optional; only used when `apiReplay` is enabled. */
  executeRequest?(request: StepRequest): Promise<StepOutcome>;
}

/** Tier-3 healer: propose a new selector for a failing step from a page
 * snapshot, or null if it can't. */
export type HealFn = (step: ReplayStep, snapshot: PageSnapshot) => Promise<string | null>;

export interface FailureReport {
  stepIndex: number;
  effect: EffectTag;
  selectorsTried: string[];
  reason: string;
}

export type ReplayResult =
  | { status: "ok" }
  | { status: "failed"; report: FailureReport }
  | { status: "needs-confirmation"; report: FailureReport };

export interface RunOptions {
  confirmDestructive: boolean;
  /** When provided (with a driver that can snapshot), enables tier-3 heal. */
  heal?: HealFn;
  /** Called when a heal succeeds — the write-back hook (quarantine in M3 P2). */
  onHeal?: (patch: { stepIndex: number; selector: string }) => void;
  /** Replay steps via their captured request (with live auth) instead of the DOM
   * when available. Faster and deterministic; still safety-gated. */
  apiReplay?: boolean;
}

/**
 * M1 deterministic replay: for each step, consult the safety gate, then try the
 * selector stack in order. No tier-3 heal yet (M3) — an exhausted stack yields a
 * structured failure report, which is exactly what a consuming agent needs to
 * take over. A destructive step without confirmation halts before any action.
 */
export async function runSkill(
  steps: ReplayStep[],
  driver: StepDriver,
  opts: RunOptions,
): Promise<ReplayResult> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const decision = gateStep(step.effect, {
      confirmDestructive: opts.confirmDestructive,
      phase: "initial",
      partiallyExecuted: false,
    });

    if (decision === "confirm") {
      return {
        status: "needs-confirmation",
        report: {
          stepIndex: i,
          effect: step.effect,
          selectorsTried: [],
          reason: "destructive step requires confirmation (pass --confirm-destructive)",
        },
      };
    }
    if (decision === "halt") {
      return {
        status: "failed",
        report: {
          stepIndex: i,
          effect: step.effect,
          selectorsTried: [],
          reason: "safety gate halted the step",
        },
      };
    }

    // API-replay: re-execute the captured request (gate already passed above).
    // On success the step is done deterministically without touching the DOM.
    // On failure, a readonly step may fall back to the DOM; a mutating/destructive
    // step must NOT (the request may have partially applied — double-execute guard).
    if (opts.apiReplay && step.request && driver.executeRequest) {
      const apiOutcome = await driver.executeRequest(step.request);
      if (apiOutcome === "ok") continue;
      if (step.effect !== "readonly") {
        return {
          status: "failed",
          report: {
            stepIndex: i,
            effect: step.effect,
            selectorsTried: [],
            reason: `api-replay of ${step.request.method} did not succeed; not falling back to the DOM (double-execute guard)`,
          },
        };
      }
      // readonly → safe to fall through to the DOM path
    }

    // Selectorless steps (e.g. navigate) are attempted once; the driver decides.
    const candidates = step.selectors.length > 0 ? step.selectors : [""];
    const tried: string[] = [];
    let outcome: StepOutcome = "fail";
    for (const selector of candidates) {
      tried.push(selector);
      outcome = await driver.execute(step, selector);
      // "ok" → done. "partial" → the action may have fired; STOP trying more
      // selectors (retrying could double-send). "fail" → try the next.
      if (outcome === "ok" || outcome === "partial") break;
    }
    if (outcome === "ok") continue;

    // The step failed. A "partial" means it may have already fired — that's the
    // double-send hazard the heal gate guards against.
    const partiallyExecuted = outcome === "partial";
    const failure: ReplayResult = {
      status: "failed",
      report: {
        stepIndex: i,
        effect: step.effect,
        selectorsTried: tried,
        reason: partiallyExecuted
          ? "step may have partially executed; not retrying (double-send guard)"
          : "all selectors exhausted",
      },
    };

    // Tier-3 heal — only if configured and the driver can snapshot the page.
    if (opts.heal && driver.snapshot) {
      const decision = gateStep(step.effect, {
        confirmDestructive: opts.confirmDestructive,
        phase: "heal",
        partiallyExecuted,
      });
      if (decision === "confirm") {
        return {
          status: "needs-confirmation",
          report: {
            stepIndex: i,
            effect: step.effect,
            selectorsTried: tried,
            reason: "destructive step requires confirmation before heal (pass --confirm-destructive)",
          },
        };
      }
      if (decision === "halt") return failure;

      const snapshot = await driver.snapshot();
      const healed = await opts.heal(step, snapshot);
      if (healed) {
        tried.push(healed);
        if ((await driver.execute(step, healed)) === "ok") {
          opts.onHeal?.({ stepIndex: i, selector: healed });
          continue;
        }
      }
    }
    return failure;
  }
  return { status: "ok" };
}
