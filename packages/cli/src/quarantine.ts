import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/** Clean re-runs needed before a heal candidate is promoted to canonical. */
export const PROMOTE_THRESHOLD = 2;

export interface Candidate {
  stepIndex: number;
  selector: string;
  confirmations: number;
}

export interface PromotionResult {
  promoted: number;
}

function candidatesFile(skillDir: string): string {
  return join(skillDir, ".quarantine", "candidates.json");
}

export function loadCandidates(skillDir: string): Candidate[] {
  const file = candidatesFile(skillDir);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? (parsed as Candidate[]) : [];
  } catch {
    return [];
  }
}

function saveCandidates(skillDir: string, candidates: Candidate[]): void {
  mkdirSync(join(skillDir, ".quarantine"), { recursive: true });
  writeFileSync(candidatesFile(skillDir), JSON.stringify(candidates, null, 2));
}

/**
 * Record a successful heal as a QUARANTINED candidate — never applied to the
 * canonical skill on first success (that's the poisoning guard). A new selector
 * for a step already under quarantine replaces it and resets its confirmations;
 * re-confirming the same selector keeps its count.
 */
export function recordHeal(skillDir: string, patch: { stepIndex: number; selector: string }): void {
  const candidates = loadCandidates(skillDir);
  const existing = candidates.find((c) => c.stepIndex === patch.stepIndex);
  if (existing) {
    if (existing.selector !== patch.selector) {
      existing.selector = patch.selector;
      existing.confirmations = 0;
    }
  } else {
    candidates.push({ stepIndex: patch.stepIndex, selector: patch.selector, confirmations: 0 });
  }
  saveCandidates(skillDir, candidates);
}

/** Mark a clean re-run that used these steps' candidates without re-healing. */
export function confirmClean(skillDir: string, stepIndices: number[]): void {
  const candidates = loadCandidates(skillDir);
  for (const c of candidates) {
    if (stepIndices.includes(c.stepIndex)) c.confirmations += 1;
  }
  saveCandidates(skillDir, candidates);
}

export function readyForPromotion(skillDir: string, threshold = PROMOTE_THRESHOLD): Candidate[] {
  return loadCandidates(skillDir).filter((c) => c.confirmations >= threshold);
}

/** Bump SKILL.md's `version: "MAJOR.MINOR"` by one minor; returns the new version. */
function bumpVersion(skillDir: string): string {
  const path = join(skillDir, "SKILL.md");
  const md = readFileSync(path, "utf8");
  let version = "1.1";
  const updated = md.replace(/(version:\s*")(\d+)\.(\d+)(")/, (_m, pre, maj, min, post) => {
    version = `${maj}.${Number(min) + 1}`;
    return `${pre}${version}${post}`;
  });
  writeFileSync(path, updated);
  return version;
}

function appendChangelog(skillDir: string, version: string, promoted: Candidate[]): void {
  const path = join(skillDir, "references", "CHANGELOG.md");
  const lines = [
    "",
    `## ${version} — heal promoted`,
    ...promoted.map(
      (c) =>
        `- step ${c.stepIndex}: selector healed to \`${c.selector}\` (promoted after ${c.confirmations} clean confirmation(s)).`,
    ),
    "",
  ];
  appendFileSync(path, lines.join("\n"));
}

/**
 * Promote quarantined candidates to canonical (§6.2). Without `force`, only
 * candidates with ≥ PROMOTE_THRESHOLD confirmations are promoted; `force`
 * promotes all (the `skillwright promote` escape hatch). Promotion writes the healed
 * selector into `promoted-selectors.json` (a keyed overlay the run loop merges
 * over recording.json), bumps the version, and appends the changelog.
 * `assets/recording.json` is immutable evidence and is NEVER modified.
 */
export function promote(skillDir: string, opts: { force?: boolean } = {}): PromotionResult {
  const all = loadCandidates(skillDir);
  const toPromote = opts.force ? all : all.filter((c) => c.confirmations >= PROMOTE_THRESHOLD);
  if (toPromote.length === 0) return { promoted: 0 };

  const overlayPath = join(skillDir, "promoted-selectors.json");
  const overlay: Record<string, string> = existsSync(overlayPath)
    ? (JSON.parse(readFileSync(overlayPath, "utf8")) as Record<string, string>)
    : {};
  for (const c of toPromote) overlay[String(c.stepIndex)] = c.selector;
  writeFileSync(overlayPath, JSON.stringify(overlay, null, 2));

  const version = bumpVersion(skillDir);
  appendChangelog(skillDir, version, toPromote);

  const promotedSet = new Set(toPromote);
  saveCandidates(
    skillDir,
    all.filter((c) => !promotedSet.has(c)),
  );
  return { promoted: toPromote.length };
}
