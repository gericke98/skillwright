import { SchemaExhaustedError, type LlmBackend, type SchemaSpec } from "./llm/backend";
import type { HealFn, PageSnapshot, ReplayStep } from "./replay";

const selectorSpec: SchemaSpec<{ selector: string }> = {
  jsonSchema: {
    type: "object",
    required: ["selector"],
    properties: { selector: { type: "string" } },
  },
  validate(value): string[] {
    const selector = (value as { selector?: unknown } | null)?.selector;
    return typeof selector === "string" && selector.trim() !== ""
      ? []
      : ["selector must be a non-empty string"];
  },
};

/** The human-readable target of a step, pulled off its selector stack. */
function targetLabel(selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const m = sel.match(/^(?:aria|text)\/(.+)$/);
    if (m) return m[1]!.trim();
  }
  return undefined;
}

/**
 * Tier-3 healer (§6.2): when a step's whole selector stack is stale, ask the LLM
 * backend for a fresh selector from the live page snapshot. Returns null when the
 * model can't produce a valid selector (SchemaExhaustedError) so the run loop
 * emits its failure report rather than throwing. The snapshot and step values
 * are already redacted upstream — no secret reaches the prompt.
 */
export function createLlmHealer(backend: LlmBackend): HealFn {
  return async (step: ReplayStep, snapshot: PageSnapshot): Promise<string | null> => {
    const label = targetLabel(step.selectors);
    const prompt = [
      "You are the selector-heal component of skillwright. A recorded automation step's selector no longer",
      "matches the page (the site changed). Propose ONE new selector that targets the same control.",
      `Step: ${step.type}${label ? ` on "${label}"` : ""} (effect: ${step.effect})`,
      step.value !== undefined ? `Value it enters: ${step.value}` : "",
      `Page URL: ${snapshot.url}`,
      "Current page ARIA snapshot:",
      snapshot.aria,
      'Return ONLY JSON: { "selector": "aria/<accessible name>" or "text/<visible text>" or a CSS selector }',
    ]
      .filter((line) => line !== "")
      .join("\n");
    try {
      const result = await backend.complete(prompt, selectorSpec);
      return result.selector;
    } catch (err) {
      if (err instanceof SchemaExhaustedError) return null;
      throw err;
    }
  };
}
