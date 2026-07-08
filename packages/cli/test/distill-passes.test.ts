import { describe, expect, test } from "vitest";
import type { Recording } from "@bskill/shared";
import { MockBackend } from "../src/llm/mock-backend";
import { inferIntent, inferParams, inferEffects, narrate } from "../src/distill/passes";

function rec(steps: Recording["steps"]): Recording {
  return {
    title: "Approve an invoice",
    steps,
    "x-bskill": {
      version: 1,
      segment: { id: "s", parentSkill: null, recordedAt: "2026-07-07T00:00:00.000Z" },
    },
  };
}

const approveInvoice = rec([
  { type: "navigate", url: "https://erp.test/invoices" },
  { type: "change", selectors: [["aria/Invoice number"]], value: "INV-1042" },
  { type: "click", selectors: [["aria/Approve invoice"]] },
]);

/** A backend that answers each pass by its TASK marker. */
function routedBackend() {
  return new MockBackend((prompt) => {
    if (prompt.includes("TASK: infer intent")) {
      return { title: "Approve an invoice", description: "Approves a pending invoice by number." };
    }
    if (prompt.includes("TASK: extract parameters")) {
      return {
        params: [
          { name: "invoice_number", type: "string", required: true, demoValue: "INV-1042" },
        ],
      };
    }
    if (prompt.includes("TASK: classify effects")) {
      return { effects: ["readonly", "mutating", "destructive"] };
    }
    if (prompt.includes("TASK: narrate steps")) {
      return {
        steps: [
          { description: "Open the invoices page.", agentStep: false },
          { description: "Type the invoice number.", agentStep: false },
          { description: "Click Approve.", agentStep: false },
        ],
      };
    }
    return {};
  });
}

describe("distiller passes", () => {
  test("inferIntent returns a title and keyword-rich description", async () => {
    const intent = await inferIntent(approveInvoice, routedBackend());
    expect(intent.title).toBe("Approve an invoice");
    expect(intent.description).toContain("invoice");
  });

  test("inferParams returns typed inputs with their demo values", async () => {
    const params = await inferParams(approveInvoice, routedBackend());
    expect(params).toHaveLength(1);
    expect(params[0]).toMatchObject({ name: "invoice_number", demoValue: "INV-1042" });
  });

  test("inferEffects returns one valid effect tag per step", async () => {
    const effects = await inferEffects(approveInvoice, routedBackend());
    expect(effects).toEqual(["readonly", "mutating", "destructive"]);
  });

  test("inferEffects rejects a wrong-length answer (validation guards the count)", async () => {
    const short = new MockBackend(() => ({ effects: ["readonly"] }));
    await expect(inferEffects(approveInvoice, short)).rejects.toBeTruthy();
  });

  test("narrate returns a description per step with an agentStep flag", async () => {
    const narrative = await narrate(approveInvoice, routedBackend());
    expect(narrative).toHaveLength(3);
    expect(narrative[2]!.description).toContain("Approve");
    expect(narrative[2]!.agentStep).toBe(false);
  });

  test("the LLM never receives a raw secret value", async () => {
    let seenPrompt = "";
    const spy = new MockBackend((prompt) => {
      seenPrompt += prompt;
      return { params: [] };
    });
    const secretRec = rec([
      { type: "change", selectors: [["aria/API key"]], value: "sk-live-ABCdef1234567890" },
    ]);
    await inferParams(secretRec, spy);
    expect(seenPrompt).not.toContain("sk-live-ABCdef1234567890");
  });
});
