import type { SkillDirectory } from "@bskill/cli";

/** A demo-typed value that the distiller should promote to a typed input. */
export interface ExpectedParam {
  /** Canonical input name, e.g. "invoice_number". */
  name: string;
  /** The literal value in the recording that must become a `{placeholder}`. */
  demoValue: string;
}

/** Hand-authored ground truth for one golden recording. */
export interface Expectations {
  requiredParams: ExpectedParam[];
  /** Step indices whose effect MUST come out `destructive` (recall gate). */
  destructiveStepIndices: number[];
  /** Secret substrings that must NOT survive in ANY output file. */
  secrets: string[];
  /** Frontmatter keys that must be present in SKILL.md. */
  frontmatterKeys: string[];
}

export interface FixtureScore {
  hardGates: {
    destructiveTagRecall: { value: number; pass: boolean };
    secretNonLeakage: { leaks: string[]; pass: boolean };
    frontmatterValid: { missing: string[]; pass: boolean };
  };
  soft: {
    paramExtractionRecall: number;
  };
  /** True only when every hard gate passes. */
  pass: boolean;
}

/** Read effect tags out of the generated `scripts/replay.ts` steps array. */
function parseEffectTags(replayScript: string | undefined): string[] {
  if (!replayScript) return [];
  const match = replayScript.match(/export const steps = (\[[\s\S]*?\]) as const;/);
  if (!match) return [];
  try {
    const steps = JSON.parse(match[1]!) as Array<{ effect?: string }>;
    return steps.map((s) => s.effect ?? "");
  } catch {
    return [];
  }
}

/** Extract the raw frontmatter block from a SKILL.md string. */
function frontmatterBlock(skillMd: string | undefined): string {
  const m = (skillMd ?? "").match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1]! : "";
}

function scoreSecretNonLeakage(files: Record<string, string>, secrets: string[]) {
  const haystack = Object.values(files).join("\n");
  const leaks = secrets.filter((s) => haystack.includes(s));
  return { leaks, pass: leaks.length === 0 };
}

function scoreDestructiveRecall(tags: string[], indices: number[]) {
  if (indices.length === 0) return { value: 1, pass: true };
  const matched = indices.filter((i) => tags[i] === "destructive").length;
  const value = matched / indices.length;
  return { value, pass: value === 1 };
}

function scoreFrontmatter(block: string, keys: string[]) {
  const missing = keys.filter((k) => !new RegExp(`^${k}:`, "m").test(block));
  return { missing, pass: missing.length === 0 };
}

function scoreParamExtraction(files: Record<string, string>, params: ExpectedParam[]): number {
  if (params.length === 0) return 1;
  const skillMd = files["SKILL.md"] ?? "";
  const block = frontmatterBlock(skillMd);
  const extracted = params.filter(
    (p) => skillMd.includes(`{${p.name}}`) || block.includes(p.name),
  ).length;
  return extracted / params.length;
}

/**
 * Score one produced skill directory against its golden expectations.
 * Pure over the directory contents — no LLM, no filesystem — so the same
 * scorer runs whether the distiller was zero-LLM (M1) or the real M2 pipeline.
 */
export function scoreFixture(produced: SkillDirectory, exp: Expectations): FixtureScore {
  const files = produced.files;
  const secretNonLeakage = scoreSecretNonLeakage(files, exp.secrets);
  const destructiveTagRecall = scoreDestructiveRecall(
    parseEffectTags(files["scripts/replay.ts"]),
    exp.destructiveStepIndices,
  );
  const frontmatterValid = scoreFrontmatter(
    frontmatterBlock(files["SKILL.md"]),
    exp.frontmatterKeys,
  );
  const paramExtractionRecall = scoreParamExtraction(files, exp.requiredParams);
  const pass = secretNonLeakage.pass && destructiveTagRecall.pass && frontmatterValid.pass;
  return {
    hardGates: { destructiveTagRecall, secretNonLeakage, frontmatterValid },
    soft: { paramExtractionRecall },
    pass,
  };
}
