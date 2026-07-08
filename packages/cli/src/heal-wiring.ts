import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { HealFn, ReplayStep } from "./replay";
import { createLlmHealer } from "./heal";
import { createDefaultBackend } from "./llm/index";
import { confirmClean, loadCandidates, recordHeal } from "./quarantine";

/**
 * Merge promoted healed selectors (the keyed overlay written by `promote`) over
 * the recording-derived steps: a promoted selector is prepended so it's tried
 * first, ahead of the stale recorded stack. recording.json itself is never
 * modified — this is the mutable layer that keeps the evidence file immutable.
 */
export function applyPromotedOverlay(steps: ReplayStep[], skillDir: string): void {
  const path = join(skillDir, "promoted-selectors.json");
  if (!existsSync(path)) return;
  try {
    const overlay = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
    steps.forEach((step, i) => {
      const selector = overlay[String(i)];
      if (selector && !step.selectors.includes(selector)) {
        step.selectors = [selector, ...step.selectors];
      }
    });
  } catch {
    // malformed overlay — ignore and replay the recorded selectors
  }
}

/** Build the tier-3 healer from the default backend, or undefined if no backend
 * is available (then `bskill run` is deterministic replay only, no heal). */
export function buildHealer(): HealFn | undefined {
  try {
    return createLlmHealer(createDefaultBackend());
  } catch {
    return undefined;
  }
}

/** The onHeal hook: quarantine each runtime heal (never canonical on first use). */
export function makeOnHeal(skillDir: string) {
  return (patch: { stepIndex: number; selector: string }): void => recordHeal(skillDir, patch);
}

/** After a clean run, count it as a confirmation toward promoting each candidate. */
export function confirmCleanRun(skillDir: string): void {
  const candidates = loadCandidates(skillDir);
  if (candidates.length > 0) confirmClean(skillDir, candidates.map((c) => c.stepIndex));
}
