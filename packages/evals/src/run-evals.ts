/**
 * On-demand eval entrypoint (`pnpm eval`). Runs the golden fixtures through the
 * REAL semantic distiller against a live backend (agent-cli by default; api if
 * BSKILL_API_KEY is set) and prints the scorecard, exiting non-zero if any hard
 * gate fails. This is the M2 release gate — token cost is real, so it runs
 * on-demand, not per-CI-push.
 */
import { distillSemantic, createDefaultBackend } from "bskill";
import type { Recording } from "@bskill/shared";
import { runEvals } from "./runner";
import { goldenFixtures } from "./fixtures";

async function main(): Promise<void> {
  const backend = createDefaultBackend();
  process.stdout.write(`bskill distiller evals — backend: ${backend.name}\n\n`);
  const distiller = (rec: Recording) => distillSemantic(rec, backend, {});

  const report = await runEvals(distiller, goldenFixtures);
  process.stdout.write(report.table + "\n\n");
  const failed = report.results.filter((r) => !r.score.pass).map((r) => r.name);
  if (report.pass) {
    process.stdout.write(`ALL ${report.results.length} FIXTURES PASS — M2 gate GREEN\n`);
  } else {
    process.stdout.write(`FAILED (${failed.length}/${report.results.length}): ${failed.join(", ")}\n`);
  }
  process.exitCode = report.pass ? 0 : 1;
}

void main().catch((err) => {
  process.stderr.write(`eval run crashed: ${(err as Error).message}\n`);
  process.exitCode = 1;
});
