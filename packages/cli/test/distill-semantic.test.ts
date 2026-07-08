import { describe, expect, test } from "vitest";
import type { Recording } from "@skillwright/shared";
import { MockBackend } from "../src/llm/mock-backend";
import { SchemaExhaustedError } from "../src/llm/backend";
import { distillSemantic } from "../src/distill/semantic";

function rec(title: string, steps: Recording["steps"]): Recording {
  return {
    title,
    steps,
    "x-skillwright": {
      version: 1,
      segment: { id: "s", parentSkill: null, recordedAt: "2026-07-07T00:00:00.000Z" },
    },
  };
}

const approveInvoice = rec("Approve an invoice", [
  { type: "navigate", url: "https://erp.test/invoices" },
  { type: "change", selectors: [["aria/Invoice number"]], value: "INV-1042" },
  { type: "click", selectors: [["aria/Approve invoice"]] },
]);

/** Routed backend; effects deliberately UNDER-tag the Approve click as mutating. */
function backend(overrides: Partial<Record<string, unknown>> = {}) {
  return new MockBackend((prompt) => {
    if (prompt.includes("TASK: infer intent"))
      return { title: "Approve an invoice", description: "Approves a pending invoice by number." };
    if (prompt.includes("TASK: extract parameters"))
      return {
        params: [{ name: "invoice_number", type: "string", required: true, demoValue: "INV-1042" }],
      };
    if (prompt.includes("TASK: classify effects"))
      return overrides.effects ?? { effects: ["readonly", "mutating", "mutating"] };
    if (prompt.includes("TASK: narrate steps"))
      return (
        overrides.narrative ?? {
          steps: [
            { description: "Open the invoices page.", agentStep: false },
            { description: "Enter the invoice number.", agentStep: false },
            { description: "Click Approve to release the invoice.", agentStep: false },
          ],
        }
      );
    return {};
  });
}

describe("distillSemantic — orchestrated LLM distiller", () => {
  test("emits the full skill directory", async () => {
    const skill = await distillSemantic(approveInvoice, backend(), {});
    expect(Object.keys(skill.files)).toEqual(
      expect.arrayContaining([
        "SKILL.md",
        "scripts/replay.ts",
        "references/walkthrough.md",
        "references/CHANGELOG.md",
        "assets/recording.json",
      ]),
    );
  });

  test("frontmatter carries the inferred description and declared inputs", async () => {
    const skill = await distillSemantic(approveInvoice, backend(), { name: "approve-invoice" });
    const md = skill.files["SKILL.md"]!;
    expect(md).toMatch(/^description:\s*Approves a pending invoice/m);
    expect(md).toContain("skillwright-inputs");
    expect(md).toContain("invoice_number");
  });

  test("rewrites the demo value to a placeholder in the replay script", async () => {
    const skill = await distillSemantic(approveInvoice, backend(), {});
    expect(skill.files["scripts/replay.ts"]).toContain("{invoice_number}");
    expect(skill.files["scripts/replay.ts"]).not.toContain("INV-1042");
  });

  test("the heuristic floor RAISES an LLM under-tag: Approve → destructive", async () => {
    // The LLM tagged the Approve click 'mutating'; the classify-effect floor
    // recognises the label and rounds up. The floor can only raise severity.
    const skill = await distillSemantic(approveInvoice, backend(), {});
    const replay = skill.files["scripts/replay.ts"]!;
    const steps = JSON.parse(replay.match(/export const steps = (\[[\s\S]*?\]) as const;/)![1]!);
    expect(steps[2].effect).toBe("destructive");
  });

  test("a secret in a field never survives in any output file (second-pass net)", async () => {
    const secretRec = rec("Save API key", [
      { type: "change", selectors: [["aria/API key"]], value: "sk-live-ABCdef1234567890" },
      { type: "click", selectors: [["aria/Save"]] },
    ]);
    const secretBackend = new MockBackend((prompt) => {
      if (prompt.includes("TASK: infer intent")) return { title: "Save API key", description: "Saves an API key." };
      if (prompt.includes("TASK: extract parameters")) return { params: [] };
      if (prompt.includes("TASK: classify effects")) return { effects: ["mutating", "mutating"] };
      if (prompt.includes("TASK: narrate steps"))
        return { steps: [{ description: "Enter the key.", agentStep: false }, { description: "Save.", agentStep: false }] };
      return {};
    });
    const skill = await distillSemantic(secretRec, secretBackend, {});
    for (const content of Object.values(skill.files)) {
      expect(content).not.toContain("sk-live-ABCdef1234567890");
    }
  });

  test("an agent-judgment step is prose in SKILL.md, never frozen into replay.ts", async () => {
    const skill = await distillSemantic(
      approveInvoice,
      backend({
        narrative: {
          steps: [
            { description: "Open the invoices page.", agentStep: false },
            { description: "Read the outstanding balance from the row.", agentStep: true },
            { description: "Click Approve.", agentStep: false },
          ],
        },
      }),
      {},
    );
    expect(skill.files["SKILL.md"]).toMatch(/\[agent\]/);
    const replay = skill.files["scripts/replay.ts"]!;
    const steps = JSON.parse(replay.match(/export const steps = (\[[\s\S]*?\]) as const;/)![1]!);
    expect(steps).toHaveLength(2); // the judgment step is not frozen
  });

  test("falls back to the zero-LLM stub when the LLM exhausts its schema budget", async () => {
    const failing = new MockBackend(() => {
      throw new SchemaExhaustedError(3, ["nope"], "garbage");
    });
    const skill = await distillSemantic(approveInvoice, failing, {});
    // demonstrated work is never lost — still a valid directory
    expect(skill.files["SKILL.md"]).toBeDefined();
    expect(skill.files["assets/recording.json"]).toBeDefined();
  });
});
