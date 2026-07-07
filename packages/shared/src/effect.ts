import { EFFECT_SEVERITY, type EffectTag } from "./schema";

/**
 * Combine effect signals for a step, always erring toward the most severe.
 * With no signal at all we return `destructive` — the round-up-on-uncertainty
 * rule that keeps the safety gate conservative. Over-tagging costs a
 * confirmation prompt; under-tagging risks an unattended destructive action.
 */
export function roundUpEffect(candidates: EffectTag[]): EffectTag {
  let maxIndex = candidates.length === 0 ? EFFECT_SEVERITY.length - 1 : 0;
  for (const c of candidates) {
    const i = EFFECT_SEVERITY.indexOf(c);
    if (i > maxIndex) maxIndex = i;
  }
  return EFFECT_SEVERITY[maxIndex]!;
}
