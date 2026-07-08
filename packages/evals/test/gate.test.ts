import { describe, expect, test } from "vitest";
import { distill } from "skillwright";
import { runEvals } from "../src/runner";
import { goldenFixtures } from "../src/fixtures";

/**
 * Phase 0 gate: the eval rig must MEASURE real quality, not rubber-stamp. We
 * prove that by running the golden fixtures through the M1 zero-LLM template
 * distiller and asserting it FAILS the way it should — leaking secrets and not
 * parameterizing. Destructive tags may already pass via the M1 heuristic; the
 * rubric explicitly allows that.
 */
const zeroLlmDistiller = (rec: Parameters<typeof distill>[0]) => distill(rec, {});

describe("Phase 0 gate — the rig fails on the zero-LLM distiller", () => {
  test("overall report FAILS (secrets leak through the template distiller)", async () => {
    const report = await runEvals(zeroLlmDistiller, goldenFixtures);
    expect(report.pass).toBe(false);
  });

  test("every adversarial fixture leaks its secret through recording.json", async () => {
    const report = await runEvals(zeroLlmDistiller, goldenFixtures);
    const adversarial = report.results.filter((r) =>
      ["oauth-token-in-url", "api-key-in-field", "card-in-field"].includes(r.name),
    );
    expect(adversarial).toHaveLength(3);
    for (const r of adversarial) {
      expect(r.score.hardGates.secretNonLeakage.pass).toBe(false);
    }
  });

  test("demo values are never parameterized by the template distiller", async () => {
    const report = await runEvals(zeroLlmDistiller, goldenFixtures);
    const withParams = report.results.filter((r) => {
      const fx = goldenFixtures.find((f) => f.name === r.name)!;
      return fx.expectations.requiredParams.length > 0;
    });
    expect(withParams.length).toBeGreaterThan(0);
    for (const r of withParams) {
      expect(r.score.soft.paramExtractionRecall).toBe(0);
    }
  });

  test("destructive steps are already caught by the M1 heuristic (allowed)", async () => {
    const report = await runEvals(zeroLlmDistiller, goldenFixtures);
    for (const r of report.results) {
      expect(r.score.hardGates.destructiveTagRecall.pass).toBe(true);
    }
  });
});
