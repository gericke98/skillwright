import { describe, expect, test } from "vitest";
import type { Recording } from "@skillwright/shared";
import { summarizeSteps } from "../src/distill/sanitize";
import { inferParams } from "../src/distill/passes";
import { MockBackend } from "../src/llm/mock-backend";

function rec(steps: Recording["steps"]): Recording {
  return {
    title: "Delete invoice",
    steps,
    "x-skillwright": {
      version: 1,
      segment: { id: "s", parentSkill: null, recordedAt: "2026-07-07T00:00:00.000Z" },
    },
  };
}

const stepWithReq = {
  type: "click",
  selectors: [["aria/Delete invoice INV-1042"]],
  requests: [{ method: "DELETE", url: "https://erp.test/api/invoices/INV-1042", timestamp: 1 }],
};

describe("network-aware distillation", () => {
  test("summarizeSteps surfaces the correlated requests (method + redacted url)", () => {
    const summary = summarizeSteps(rec([stepWithReq]));
    expect(summary[0]!.requests).toEqual([
      { method: "DELETE", url: "https://erp.test/api/invoices/INV-1042" },
    ]);
  });

  test("a step with no requests omits the field", () => {
    const summary = summarizeSteps(rec([{ type: "click", selectors: [["aria/View"]] }]));
    expect(summary[0]!.requests).toBeUndefined();
  });

  test("the parameterization prompt carries the network calls as evidence", async () => {
    let seen = "";
    const spy = new MockBackend((prompt) => {
      seen = prompt;
      return { params: [] };
    });
    await inferParams(rec([stepWithReq]), spy);
    // the LLM sees the actual API call so it can parameterize from network truth
    expect(seen).toContain("DELETE");
    expect(seen).toContain("/api/invoices/INV-1042");
  });
});
