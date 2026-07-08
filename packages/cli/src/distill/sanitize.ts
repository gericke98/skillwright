import {
  PLACEHOLDER,
  redactUrl,
  redactValue,
  valueLooksSecret,
  type Recording,
} from "@bskill/shared";
import { stepLabel } from "../step-label";

/** A per-step view safe to embed in an LLM prompt — never carries a secret. */
export interface StepSummary {
  index: number;
  type: string;
  label?: string;
  value?: string;
  url?: string;
}

/**
 * Build the redacted step view the distiller passes to the LLM. Values and URLs
 * are scrubbed FIRST (the model never sees a live credential), and the visible
 * label is pulled off the selector stack.
 */
export function summarizeSteps(recording: Recording): StepSummary[] {
  return recording.steps.map((step, index) => {
    const summary: StepSummary = { index, type: step.type };
    const label = stepLabel(step);
    if (label) summary.label = label;
    if (typeof step.value === "string") summary.value = redactValue(step.value);
    if (typeof step.url === "string") summary.url = redactUrl(step.url);
    return summary;
  });
}

/**
 * Second-pass redaction net (§9): scrub any secret-shaped token that slipped
 * into a rendered output file. Token-wise so it can run over Markdown/JSON
 * without wrecking structure; over-redaction is the accepted bias.
 */
export function scrubText(text: string): string {
  return text.replace(/[^\s"'`]+/g, (token) => (valueLooksSecret(token) ? PLACEHOLDER : token));
}
