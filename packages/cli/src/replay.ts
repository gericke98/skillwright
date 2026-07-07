import type { EffectTag } from "@bskill/shared";
import { gateStep } from "./safety-gate";

export interface ReplayStep {
  type: string;
  effect: EffectTag;
  /** Ordered selector alternatives, most stable first. */
  selectors: string[];
}

/**
 * Abstracts "try to perform this step using this one selector" against a live
 * page. The real implementation drives Playwright over CDP; tests inject a fake.
 * Keeping this an interface is what makes the run loop (and its safety-gate
 * integration) testable without a browser.
 */
export interface StepDriver {
  execute(step: ReplayStep, selector: string): Promise<"ok" | "fail">;
}

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

    const tried: string[] = [];
    let ok = false;
    for (const selector of step.selectors) {
      tried.push(selector);
      if ((await driver.execute(step, selector)) === "ok") {
        ok = true;
        break;
      }
    }
    if (!ok) {
      return {
        status: "failed",
        report: {
          stepIndex: i,
          effect: step.effect,
          selectorsTried: tried,
          reason: "all selectors exhausted (heal lands in M3)",
        },
      };
    }
  }
  return { status: "ok" };
}
