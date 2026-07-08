import type { Step } from "@bskill/shared";

const VALUE_ACTIONS = new Set(["change", "input", "select"]);

/** The primary (most-stable) selector of a step, or undefined. */
function primarySelector(step: Step): string | undefined {
  return step.selectors?.[0]?.[0];
}

/**
 * Remove redundant focus-clicks: a click immediately followed by a value edit
 * (change/input/select) on the SAME target is dropped, because the edit step
 * already both locates and interacts with the element on replay. Every other
 * step — stray clicks, the destructive final click, edits — is preserved
 * faithfully. Keeps recordings clean without dropping meaningful actions.
 */
export function coalesceSteps(steps: Step[]): Step[] {
  const out: Step[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const next = steps[i + 1];
    const isRedundantFocusClick =
      step.type === "click" &&
      next !== undefined &&
      VALUE_ACTIONS.has(next.type) &&
      primarySelector(step) !== undefined &&
      primarySelector(step) === primarySelector(next);
    if (isRedundantFocusClick) continue;
    out.push(step);
  }
  return out;
}
