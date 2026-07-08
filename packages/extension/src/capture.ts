import { classifyStepEffect, type Step } from "@skillwright/shared";
import { computeSelectorStack } from "./selector";
import { redactValue } from "./redact";

/** Actions that carry a field value worth recording (post-redaction). */
const VALUE_ACTIONS = new Set(["change", "input", "select"]);

/**
 * The REAL element an event acted on. Inside a shadow DOM, `event.target` is
 * retargeted to the shadow host; `event.composedPath()[0]` is the actual inner
 * element the user interacted with. Falls back to `event.target` for plain DOM.
 */
export function eventTarget(event: Event): Element | undefined {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const first = path.length > 0 ? path[0] : event.target;
  return first instanceof Element ? first : undefined;
}

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
export function buildCaptureStep(el: Element, action: string, now: () => number = () => Date.now()): Step {
  const label = accessibleName(el);
  const step: Step = {
    type: action,
    selectors: computeSelectorStack(el).map((s) => [s]),
    effect: classifyStepEffect({ action, label }),
    // Wall-clock timestamp so the passive network observer's requests can be
    // correlated back to the step that fired them (Capture v2).
    timestamp: now(),
  };

  if (VALUE_ACTIONS.has(action) && "value" in el) {
    const raw = String((el as HTMLInputElement).value ?? "");
    const type = el.getAttribute("type") ?? undefined;
    step.value = redactValue(raw, { type });
  }

  return step;
}
