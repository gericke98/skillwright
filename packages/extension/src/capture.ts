import { classifyStepEffect, type Step } from "@skillwright/shared";
import { computeSelectorStack } from "./selector";
import { redactValue } from "./redact";

/** Actions that carry a field value worth recording (post-redaction). */
const VALUE_ACTIONS = new Set(["change", "input", "select"]);

/** Whether an element is an editing host (a rich-text editor). Prefers the live
 * `isContentEditable` property but falls back to the attribute so it's robust in
 * DOM implementations that don't compute the property. */
function isContentEditable(el: Element): boolean {
  if ((el as HTMLElement).isContentEditable) return true;
  const attr = el.getAttribute("contenteditable");
  return attr !== null && attr !== "false";
}

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

/** Meaningful keys worth recording — navigation/submission keys, not the plain
 * character keystrokes already captured by the `change` event's final value. */
const SPECIAL_KEYS = new Set([
  "Enter",
  "Escape",
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

/**
 * Whether a keydown is worth capturing: a special key (Enter submits a form,
 * Escape closes, arrows navigate) or ANY key pressed with a modifier (a keyboard
 * shortcut). Plain typing is captured via the field's final `change` value.
 */
export function shouldCaptureKey(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  return SPECIAL_KEYS.has(event.key);
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
export function buildCaptureStep(
  el: Element,
  action: string,
  now: () => number = () => Date.now(),
  key?: string,
): Step {
  const label = accessibleName(el);
  const step: Step = {
    type: action,
    selectors: computeSelectorStack(el).map((s) => [s]),
    effect: classifyStepEffect({ action, label }),
    // Wall-clock timestamp so the passive network observer's requests can be
    // correlated back to the step that fired them (Capture v2).
    timestamp: now(),
  };

  if (VALUE_ACTIONS.has(action)) {
    const type = el.getAttribute("type") ?? undefined;
    if ("value" in el) {
      // A checkbox/radio's `value` attr ("on") is meaningless for replay — the
      // interaction is about the resulting checked state. Record that boolean so
      // replay can setChecked() it (fill()-ing a checkbox throws).
      if (type === "checkbox" || type === "radio") {
        step.value = String((el as HTMLInputElement).checked);
      } else {
        const raw = String((el as HTMLInputElement).value ?? "");
        step.value = redactValue(raw, { type });
      }
    } else if (isContentEditable(el)) {
      // Rich-text editors (Gmail/Slack/Notion) are contenteditable divs with no
      // form `value` — record their text so replay (fill() supports it) works.
      step.value = redactValue((el.textContent ?? "").trim(), {});
    }
  }

  if (action === "keydown" && key) step.key = key;

  return step;
}
