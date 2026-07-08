import { roundUpEffect } from "./effect";
import type { EffectTag } from "./schema";

/**
 * The signals the zero-LLM (M1) distiller can read off a captured step without
 * any model call. In M2 the LLM distiller can override these with richer
 * judgment, but the heuristic here is the floor the safety gate relies on.
 */
export interface StepEffectInput {
  /** The captured action: "click", "change", "navigate", "scroll", ... */
  action: string;
  /** Accessible name or visible text of the target element, if known. */
  label?: string;
  /** ARIA role of the target element, if known. */
  role?: string;
}

/**
 * Verbs whose presence in a control's label implies an irreversible or
 * high-consequence action. Matched as substrings against the lowercased label.
 * Bias is intentionally broad — a false positive costs a confirmation prompt,
 * a false negative can double-send on a live account.
 */
const DESTRUCTIVE_VERBS = [
  "delete",
  "remove",
  "send",
  "pay",
  "submit",
  "confirm",
  "transfer",
  "publish",
  "archive",
  "cancel",
  "purchase",
  "checkout",
  "approve",
  "wipe",
  "destroy",
  // Real-world high-consequence verbs (round-up-on-uncertainty; a confirmation
  // prompt is cheap, an unattended destructive action is not).
  "deactivate",
  "terminate",
  "discard",
  "revoke",
  "withdraw",
  "erase",
  "uninstall",
  "unsubscribe",
  "disconnect",
];

/**
 * Classify one step's effect on the world. Load-bearing for the replay safety
 * gate (§6.2): a `destructive` result forces confirmation and blocks unattended
 * auto-heal.
 *
 * SAFETY CONTRACT (see classify-effect.test.ts — do not weaken):
 *   - A control whose label implies an irreversible action → "destructive".
 *   - Editing a field (a "change" action) → at least "mutating".
 *   - A pure read (scroll, plain navigation) → "readonly".
 *   - Anything unrecognized → round UP to "destructive".
 */
export function classifyStepEffect(input: StepEffectInput): EffectTag {
  const label = (input.label ?? "").toLowerCase();

  // A dangerous label dominates regardless of the action type.
  if (DESTRUCTIVE_VERBS.some((verb) => label.includes(verb))) {
    return "destructive";
  }

  switch (input.action) {
    case "change":
    case "input":
    case "select":
      return "mutating";
    case "scroll":
    case "navigate":
      return "readonly";
    case "click":
    case "keydown":
      // A click/keypress with no dangerous label is treated as mutating: it may
      // submit or toggle server state, but is not known-irreversible. Still not
      // readonly — we never assume a click is side-effect-free.
      return "mutating";
    default:
      // Unrecognized action, no signal — round up to destructive.
      return roundUpEffect([]);
  }
}
