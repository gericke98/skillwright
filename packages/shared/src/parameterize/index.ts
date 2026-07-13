import type { Recording, Step } from "../schema";
import type { LlmBackend } from "../llm/backend";
import { inferParams, type ParamDef } from "../distill/passes";
import { PLACEHOLDER } from "../redact";
import { stepLabel } from "../step-label";
import { toSlug } from "../slug";
import { inferParamCritique, type Critique } from "./critic";
import { reconcileParams, type FinalParam } from "./reconcile";

export { inferParamCritique, type Critique };
export { reconcileParams, type FinalParam };

/**
 * Name a secret step has when no proposal param claims it. Prefers the
 * step's accessible label (slugified) so the resulting param name is
 * meaningful; falls back to a positional name when the step carries no
 * usable label (e.g. no aria/text selector at all).
 */
function synthesizeSecretName(step: Step, index: number): string {
  const label = stepLabel(step);
  if (label !== undefined && label.trim() !== "") return toSlug(label);
  return `secret_${index}`;
}

/**
 * Derive the set of param names that MUST be treated as secrets by
 * `reconcileParams`, from two sources:
 *
 *  1. Claimed secrets — any `proposal` param whose `demoValue` is the
 *     redaction placeholder. The proposer saw the placeholder (never the
 *     real value — redaction runs before any LLM call) and named it.
 *  2. Missed secrets — a captured step whose `value` is the placeholder
 *     that NO proposal param claims (the proposer dropped a password/secret
 *     entirely).
 *
 * On (2): `ParamDef` carries no step back-reference, so which claimed param
 * (if any) corresponds to which placeholder step is NOT derivable — there is
 * no way to correlate them exactly. We used to guess positionally (assume the
 * proposer's claims are a prefix of step order, and take the trailing
 * surplus), but that guess is only correct when the missed step is last.
 * Counter-example: steps in order password / recovery-code / api-key, all
 * PLACEHOLDER, and the proposer claims ONLY the middle one (recovery-code).
 * The old rule computed claimedCount=1, surplus=2, and took the LAST 2
 * placeholder steps (recovery-code + api-key) — silently dropping password
 * with NO parameter at all, even though the recording step still holds the
 * literal PLACEHOLDER value (replay would type it into a live password
 * field).
 *
 * Fix: don't guess which steps were missed. If we only know (from the count)
 * that AT LEAST ONE step was missed — `placeholderSteps.length >
 * claimed.size` — synthesize a name for EVERY placeholder step and union all
 * of them in. This may occasionally produce a duplicate/benign extra param
 * when a synthesized name differs from the name the proposer chose for the
 * same field (e.g. proposer said `recovery_code`, the label slugifies to
 * `recovery-code-field`) — an extra required input the user has to fill in.
 * That's an acceptable UX cost; the alternative (guessing wrong) silently
 * drops a real secret, which is not acceptable. If every placeholder step is
 * already claimed, nothing is synthesized.
 *
 * Follow-up (not implemented here): add a step-index back-reference to
 * `ParamDef` so proposed params can be correlated to their originating step
 * exactly, eliminating the need for this union entirely.
 */
export function secretNamesOf(recording: Recording, proposal: ParamDef[]): Set<string> {
  const secretNames = new Set<string>();
  for (const p of proposal) {
    if (p.demoValue === PLACEHOLDER) secretNames.add(p.name);
  }

  const placeholderSteps: { step: Step; index: number }[] = [];
  recording.steps.forEach((step, index) => {
    if (typeof step.value === "string" && step.value === PLACEHOLDER) {
      placeholderSteps.push({ step, index });
    }
  });

  const claimedCount = proposal.filter((p) => p.demoValue === PLACEHOLDER).length;

  if (placeholderSteps.length > claimedCount) {
    for (const { step, index } of placeholderSteps) {
      const name = synthesizeSecretName(step, index);
      if (!secretNames.has(name)) secretNames.add(name);
    }
  }

  return secretNames;
}

/**
 * Orchestrates the full parameterization pipeline: propose (1 LLM call),
 * critique (1 LLM call), then deterministically reconcile — exactly two
 * backend calls total, bounding the cost of parameterizing a recording.
 */
export async function parameterize(recording: Recording, backend: LlmBackend): Promise<FinalParam[]> {
  const proposal = await inferParams(recording, backend);
  const critique = await inferParamCritique(recording, proposal, backend);
  return reconcileParams(proposal, critique, secretNamesOf(recording, proposal));
}
