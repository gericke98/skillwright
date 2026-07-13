/**
 * In-extension Verify: replay the freshly compiled skill against the live tab
 * so the user sees it work before they trust it — the last stage of the panel
 * pipeline.
 *
 * Deliberately reuses `performStep` (the relay's step executor) rather than
 * growing a second implementation: verify must exercise the SAME replay
 * semantics the CLI will later run, or a green verify would mean nothing.
 */
import type { ReplayStep } from "@skillwright/shared";
import { performStep, type CdpSend } from "../relay-client";

export type StepOutcome = "ok" | "fail" | "skipped-destructive";

export interface VerifyResult {
  index: number;
  outcome: StepOutcome;
  error?: string;
}

export interface VerifyOptions {
  tabId: number;
  /** Destructive steps are SKIPPED unless this is explicitly set. */
  confirmDestructive?: boolean;
  send: CdpSend;
}

/**
 * Replay `steps` against the attached tab, reporting per-step outcomes.
 *
 * Two rules:
 *  - A `destructive` step is skipped unless `confirmDestructive` — verifying a
 *    skill must never be the thing that deletes the user's invoice. Skipping is
 *    NOT a failure: the run continues.
 *  - The run STOPS at the first real failure. Past a failed step the page is in
 *    a state the recording never saw, so every later result would be noise —
 *    and the user only needs the FIRST broken step to act.
 *
 * Never throws: a CDP error (debugger detached, tab closed) becomes a `fail`
 * result carrying the message.
 */
export async function verifySkill(steps: ReplayStep[], opts: VerifyOptions): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];

  for (const [index, step] of steps.entries()) {
    if (step.effect === "destructive" && !opts.confirmDestructive) {
      results.push({ index, outcome: "skipped-destructive" });
      continue;
    }

    const selector = step.selectors[0] ?? "";
    const res = await performStep(
      {
        action: step.type,
        selector,
        value: step.value,
        key: step.key,
        modifiers: step.modifiers,
      },
      opts.send,
    );

    if (res.ok) {
      results.push({ index, outcome: "ok" });
      continue;
    }
    // Name the selector in the error: "step 3 failed" is useless on its own,
    // and the selector is what the user (or the healer) has to go fix.
    results.push({
      index,
      outcome: "fail",
      error: `step ${index + 1} (${step.type} ${selector}): ${res.error ?? "failed"}`,
    });
    return results;
  }

  return results;
}
