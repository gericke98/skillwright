import type { ParamDef } from "../distill/passes";
import type { Critique } from "./critic";

export interface FinalParam extends ParamDef {
  rationale: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Deterministic merge of the proposer's param list with the critic's Critique.
 *
 * Pure function, no LLM call — the whole point is that these rules are fixed
 * and auditable rather than another model's opinion. Rule order matters:
 *
 *   1. Start from `proposal`, apply `typeFixes` (by name).
 *   2. Apply `removals` ONLY when the name is not a secret AND a non-empty
 *      reason is present — a removal of a secret, or one without a reason,
 *      is silently ignored (the param is kept).
 *   3. Union `critique.additions`, deduped by name against what's already
 *      present after steps 1-2.
 *   4. Force every `secretNames` member to be present and `required: true`,
 *      overriding anything the proposer/critic said — this floor cannot be
 *      removed by the critic.
 *   5. Assign `rationale` + `confidence`.
 *
 * Confidence-default choice: params the critic never touched (not added, not
 * type-fixed) keep the proposer's own guess as-is with confidence "low" —
 * they were never independently verified by a second pass, so we're less
 * sure of them than critic-touched ("medium") or secret-floor ("high")
 * params. This intentionally ranks "critic looked at it and agreed by
 * silence" below "critic actively changed it", since silence isn't a real
 * signal here — only removal/typeFix/addition are.
 */
export function reconcileParams(proposal: ParamDef[], critique: Critique, secretNames: Set<string>): FinalParam[] {
  const typeFixByName = new Map(critique.typeFixes.map((f) => [f.name, f]));
  const touchedByTypeFix = new Set(critique.typeFixes.map((f) => f.name));

  // Step 1: start from proposal, apply typeFixes.
  const working: FinalParam[] = proposal.map((p) => {
    const fix = typeFixByName.get(p.name);
    return {
      ...p,
      type: fix?.type ?? p.type,
      required: fix?.required ?? p.required,
      rationale: "",
      confidence: "low",
    };
  });

  // Step 2: apply removals — only non-secret names with a non-empty reason.
  const toRemove = new Set(
    critique.removals.filter((r) => !secretNames.has(r.name) && r.reason.trim() !== "").map((r) => r.name),
  );
  const result = working.filter((p) => !toRemove.has(p.name));

  // Step 3: union critique.additions, deduped by name.
  const presentNames = new Set(result.map((p) => p.name));
  for (const addition of critique.additions) {
    if (presentNames.has(addition.name)) continue;
    presentNames.add(addition.name);
    result.push({ ...addition, rationale: "", confidence: "low" });
  }

  // Step 4: force every secret to be present and required:true.
  for (const secretName of secretNames) {
    const existing = result.find((p) => p.name === secretName);
    if (existing) {
      existing.required = true;
    } else {
      result.push({
        name: secretName,
        type: "string",
        required: true,
        demoValue: "",
        rationale: "",
        confidence: "low",
      });
    }
  }

  // Step 5: rationale + confidence.
  for (const p of result) {
    if (secretNames.has(p.name)) {
      p.rationale = "secret — always a parameter";
      p.confidence = "high";
    } else if (touchedByTypeFix.has(p.name) || critique.additions.some((a) => a.name === p.name)) {
      p.rationale = touchedByTypeFix.has(p.name) ? "critic adjusted type/required" : "critic-proposed addition";
      p.confidence = "medium";
    } else {
      p.rationale = "proposer default, unreviewed by critic";
      p.confidence = "low";
    }
  }

  return result;
}
