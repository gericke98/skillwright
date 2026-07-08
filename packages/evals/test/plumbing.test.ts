import { describe, expect, test } from "vitest";
import { distillSemantic, MockBackend, extractFirstJson } from "bskill";
import type { Recording } from "@bskill/shared";
import { runEvals } from "../src/runner";
import { goldenFixtures } from "../src/fixtures";

/**
 * P2 gate: with a cooperative (schema-valid) LLM, the orchestrator plumbing
 * produces skills that PASS every hard gate — secrets redacted, destructive
 * steps tagged (heuristic floor backs the mock's deliberately-lax effects),
 * frontmatter valid. This isolates plumbing from prompt quality; the REAL
 * distiller quality is scored in P3 against live backends.
 */
interface Summary {
  type: string;
  label?: string;
  value?: string;
}

function stepsFromPrompt(prompt: string): Summary[] {
  const after = prompt.slice(prompt.indexOf("Steps:") + "Steps:".length);
  const parsed = extractFirstJson(after);
  return Array.isArray(parsed) ? (parsed as Summary[]) : [];
}

function snake(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** An "ideal LLM": schema-valid answers synthesized from the redacted prompt. */
const idealBackend = new MockBackend((prompt) => {
  const steps = stepsFromPrompt(prompt);
  if (prompt.includes("TASK: infer intent")) {
    return { title: "Recorded task", description: "Performs the recorded browser task on demand." };
  }
  if (prompt.includes("TASK: extract parameters")) {
    const params = steps
      .filter((s) => s.value && s.label && !/^\{.*\}$/.test(s.value))
      .map((s) => ({ name: snake(s.label!), type: "string", required: true, demoValue: s.value! }));
    return { params };
  }
  if (prompt.includes("TASK: classify effects")) {
    // Deliberately lax: everything readonly. The heuristic floor must recover
    // the destructive tags — proving the fusion, not the mock.
    return { effects: steps.map(() => "readonly") };
  }
  if (prompt.includes("TASK: narrate steps")) {
    return { steps: steps.map((s) => ({ description: `${s.type} ${s.label ?? ""}`.trim(), agentStep: false })) };
  }
  return {};
});

const distiller = (rec: Recording) => distillSemantic(rec, idealBackend, {});

describe("P2 gate — golden fixtures pass on the mock-backed semantic distiller", () => {
  test("every fixture clears all hard gates", async () => {
    const report = await runEvals(distiller, goldenFixtures);
    const failing = report.results.filter((r) => !r.score.pass).map((r) => r.name);
    expect(failing).toEqual([]);
    expect(report.pass).toBe(true);
  });

  test("adversarial secrets are fully redacted (heuristic floor + net)", async () => {
    const report = await runEvals(distiller, goldenFixtures);
    for (const r of report.results) {
      expect(r.score.hardGates.secretNonLeakage.pass).toBe(true);
    }
  });

  test("destructive steps survive even though the mock tagged everything readonly", async () => {
    const report = await runEvals(distiller, goldenFixtures);
    for (const r of report.results) {
      expect(r.score.hardGates.destructiveTagRecall.pass).toBe(true);
    }
  });

  test("parameterization plumbing lands: invoice_number extracted end-to-end", async () => {
    const report = await runEvals(distiller, goldenFixtures);
    const approve = report.results.find((r) => r.name === "approve-invoice")!;
    expect(approve.score.soft.paramExtractionRecall).toBe(1);
  });
});
