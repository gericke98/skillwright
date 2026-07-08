import type { Recording } from "@bskill/shared";
import type { SkillDirectory } from "bskill";
import { scoreFixture, type Expectations, type FixtureScore } from "./rubric";

/** Any distiller: zero-LLM (M1) or the real M2 pipeline, sync or async. */
export type Distiller = (recording: Recording) => SkillDirectory | Promise<SkillDirectory>;

/** One golden recording plus its hand-authored ground truth. */
export interface FixtureCase {
  name: string;
  recording: Recording;
  expectations: Expectations;
}

export interface EvalResult {
  name: string;
  score: FixtureScore;
}

export interface EvalReport {
  results: EvalResult[];
  /** True only when every fixture passes all hard gates. */
  pass: boolean;
  /** Human-readable scorecard. */
  table: string;
}

function renderTable(results: EvalResult[]): string {
  const header = "fixture               | dstr | secret | fmatter | param | PASS";
  const rows = results.map((r) => {
    const g = r.score.hardGates;
    const cells = [
      r.name.padEnd(21),
      g.destructiveTagRecall.value.toFixed(2).padStart(4),
      (g.secretNonLeakage.pass ? "ok" : "LEAK").padStart(6),
      (g.frontmatterValid.pass ? "ok" : "MISS").padStart(7),
      r.score.soft.paramExtractionRecall.toFixed(2).padStart(5),
      r.score.pass ? "✓" : "✗",
    ];
    return cells.join(" | ");
  });
  return [header, ...rows].join("\n");
}

/**
 * Run every fixture through `distiller`, score each against its expectations,
 * and aggregate. The report passes only when all fixtures clear their hard
 * gates — the runner is distiller-agnostic, so the M2 gate is just
 * `runEvals(realDistiller, goldenFixtures).pass === true`.
 */
export async function runEvals(
  distiller: Distiller,
  fixtures: FixtureCase[],
): Promise<EvalReport> {
  const results: EvalResult[] = [];
  for (const fixture of fixtures) {
    const produced = await distiller(fixture.recording);
    results.push({ name: fixture.name, score: scoreFixture(produced, fixture.expectations) });
  }
  return {
    results,
    pass: results.every((r) => r.score.pass),
    table: renderTable(results),
  };
}
