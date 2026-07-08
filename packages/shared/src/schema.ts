/**
 * bskill recording schema — an @puppeteer/replay UserFlow extended with an
 * `x-bskill` namespace. Extra keys are ignored by standard Recorder/Puppeteer
 * tooling, so the file stays interop-clean.
 */

/**
 * What a step does to the world. Load-bearing for the replay safety gate:
 * `destructive` steps require confirmation and are never auto-healed after a
 * partial execution. When the distiller is uncertain it MUST round UP toward
 * `destructive` — under-tagging is the failure the eval suite guards against.
 */
export type EffectTag = "readonly" | "mutating" | "destructive";

/** Ordered by increasing consequence; used by the round-up rule. */
export const EFFECT_SEVERITY: readonly EffectTag[] = ["readonly", "mutating", "destructive"];

/** A fallback stack of selectors for one target, most-stable first. */
export type SelectorStack = string[][];

export interface Step {
  type: string;
  selectors?: SelectorStack;
  /** Assigned by the distiller; absent on a freshly captured recording. */
  effect?: EffectTag;
  [key: string]: unknown;
}

/**
 * Segment metadata. v1 is single-segment: a new skill's first (and only)
 * recording has `parentSkill: null`. A non-null parentSkill marks a segment
 * meant to attach to an existing skill (rescue mode, post-v1) — v1 consumers
 * must refuse it rather than silently drop it.
 */
export interface Segment {
  id: string;
  parentSkill: string | null;
  recordedAt: string;
}

export interface BskillNamespace {
  version: number;
  segment: Segment;
}

export interface Recording {
  title: string;
  steps: Step[];
  "x-bskill": BskillNamespace;
}
