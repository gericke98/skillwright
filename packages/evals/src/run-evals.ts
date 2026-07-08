/**
 * On-demand eval entrypoint (`pnpm eval`). Runs the golden fixtures through a
 * distiller and prints the scorecard, exiting non-zero if any hard gate fails.
 *
 * P0 baseline: wired to the M1 zero-LLM template distiller, which is EXPECTED
 * to fail (leaks secrets, no parameterization) — that failure is the proof the
 * rig measures real quality. In P3 this swaps to the real M2 distiller and the
 * scorecard becomes the M2 release gate.
 */
import { distill } from "@bskill/cli";
import { runEvals } from "./runner";
import { goldenFixtures } from "./fixtures";

async function main(): Promise<void> {
  const report = await runEvals((rec) => distill(rec, {}), goldenFixtures);
  process.stdout.write("bskill distiller evals — baseline: M1 zero-LLM template\n\n");
  process.stdout.write(report.table + "\n\n");
  const failed = report.results.filter((r) => !r.score.pass).map((r) => r.name);
  if (report.pass) {
    process.stdout.write("ALL FIXTURES PASS\n");
  } else {
    process.stdout.write(`FAILED (${failed.length}/${report.results.length}): ${failed.join(", ")}\n`);
  }
  process.exitCode = report.pass ? 0 : 1;
}

void main();
