import { classifyStepEffect, type Step } from "@skillwright/shared";
import { computeSelectorStack } from "./selector";
import { redactValue } from "./redact";

/** Actions that carry a field value worth recording (post-redaction). */
const VALUE_ACTIONS = new Set(["change", "input", "select"]);

/** The accessible name the effect classifier reasons about. */
function accessibleName(el: Element): string | undefined {
  const aria = el.getAttribute("aria-label")?.trim();
  if (aria) return aria;
  const text = el.textContent?.trim();
  return text && text.length <= 50 ? text : undefined;
}

/**
 * Turn a captured DOM interaction into a recording Step: selector stack
 * (wrapped as string[][] per the schema), effect tag, and — for value actions —
 * the redacted field value. This is the pure heart of capture; the content
 * script's event listeners are a thin shell that calls it.
 */
export function buildCaptureStep(el: Element, action: string): Step {
  const label = accessibleName(el);
  const step: Step = {
    type: action,
    selectors: computeSelectorStack(el).map((s) => [s]),
    effect: classifyStepEffect({ action, label }),
  };

  if (VALUE_ACTIONS.has(action) && "value" in el) {
    const raw = String((el as HTMLInputElement).value ?? "");
    const type = el.getAttribute("type") ?? undefined;
    step.value = redactValue(raw, { type });
  }

  return step;
}
