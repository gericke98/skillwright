import type { Step } from "@bskill/shared";

/**
 * Pull a human-readable label off a step's selector stack. `aria/Name` and
 * `text/Text` selectors carry the accessible name / visible text; that string
 * is what the effect classifier reasons about.
 */
export function stepLabel(step: Step): string | undefined {
  for (const stack of step.selectors ?? []) {
    for (const sel of stack) {
      const m = sel.match(/^(?:aria|text)\/(.+)$/);
      if (m) return m[1]!.trim();
    }
  }
  return undefined;
}
