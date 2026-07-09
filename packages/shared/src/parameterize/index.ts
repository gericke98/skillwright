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
 *     entirely). We can't know which specific claimed param corresponds to
 *     which step, so we use a count-based surplus rule: if there are more
 *     PLACEHOLDER-valued steps than PLACEHOLDER-valued proposal params, the
 *     excess (taken from the END of step order, since a recording's later
 *     secret fields are the ones most likely to be overlooked) get a
 *     synthesized name so `reconcileParams`'s secret floor force-adds them
 *     as required params even though no pass ever named them.
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
  const surplus = placeholderSteps.length - claimedCount;

  if (surplus > 0) {
    const missed = placeholderSteps.slice(-surplus);
    for (const { step, index } of missed) {
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
