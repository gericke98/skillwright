import {
  PLACEHOLDER,
  redactUrl,
  redactValue,
  valueLooksSecret,
  type Recording,
} from "@skillwright/shared";
import { stepLabel } from "../step-label";

/** A per-step view safe to embed in an LLM prompt — never carries a secret. */
export interface StepSummary {
  index: number;
  type: string;
  label?: string;
  value?: string;
  url?: string;
  /** The network calls this step fired (Capture v2) — HTTP-method + redacted URL
   * (+ redacted body) ground truth the distiller uses for effect and parameterization. */
  requests?: Array<{ method: string; url: string; body?: string }>;
}

/**
 * Build the redacted step view the distiller passes to the LLM. Values and URLs
 * are scrubbed FIRST (the model never sees a live credential), the visible label
 * is pulled off the selector stack, and any correlated network calls are surfaced
 * as method + redacted URL so the model can reason from network truth.
 */
export function summarizeSteps(recording: Recording): StepSummary[] {
  return recording.steps.map((step, index) => {
    const summary: StepSummary = { index, type: step.type };
    const label = stepLabel(step);
    if (label) summary.label = label;
    if (typeof step.value === "string") summary.value = redactValue(step.value);
    if (typeof step.url === "string") summary.url = redactUrl(step.url);
    if (step.requests && step.requests.length > 0) {
      summary.requests = step.requests.map((r) => {
        const req: { method: string; url: string; body?: string } = {
          method: r.method,
          url: redactUrl(r.url),
        };
        if (typeof r.body === "string") req.body = r.body;
        return req;
      });
    }
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
