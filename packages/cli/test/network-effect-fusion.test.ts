import { describe, expect, test } from "vitest";
import type { Recording } from "@skillwright/shared";
import { distill, toReplaySteps } from "../src/index";
import { MockBackend } from "../src/llm/mock-backend";
import { distillSemantic } from "../src/distill/semantic";

function rec(steps: Recording["steps"]): Recording {
  return {
    title: "View then delete",
    steps,
    "x-skillwright": {
      version: 1,
      segment: { id: "s", parentSkill: null, recordedAt: "2026-07-07T00:00:00.000Z" },
    },
  };
}

function effectsFromRecordingJson(files: Record<string, string>): string[] {
  const parsed = JSON.parse(files["assets/recording.json"]!) as Recording;
  return parsed.steps.map((s) => s.effect as string);
}

const del = { method: "DELETE", url: "https://api.test/invoices/INV-1", timestamp: 1 };

describe("network-truth effect fusion (Capture v2 slice 1)", () => {
  test("zero-LLM distill: a DELETE request raises a benign-labelled step to destructive", () => {
    // Label says "View" (heuristic → mutating at most); the network truth is a DELETE.
    const skill = distill(
      rec([{ type: "click", selectors: [["aria/View details"]], requests: [del] }]),
      {},
    );
    expect(effectsFromRecordingJson(skill.files)[0]).toBe("destructive");
  });

  test("semantic distill: a DELETE request overrides an LLM 'readonly' tag", async () => {
    const backend = new MockBackend((prompt) => {
      if (prompt.includes("TASK: infer intent")) return { title: "View", description: "Views a thing." };
      if (prompt.includes("TASK: extract parameters")) return { params: [] };
      if (prompt.includes("TASK: classify effects")) return { effects: ["readonly"] }; // LLM under-tags
      if (prompt.includes("TASK: narrate steps"))
        return { steps: [{ description: "Open the details view.", agentStep: false }] };
      return {};
    });
    const skill = await distillSemantic(
      rec([{ type: "click", selectors: [["aria/View details"]], requests: [del] }]),
      backend,
      {},
    );
    expect(effectsFromRecordingJson(skill.files)[0]).toBe("destructive");
  });

  test("GET-only requests do not add severity to a mutating step", () => {
    const skill = distill(
      rec([{ type: "change", selectors: [["aria/Search"]], requests: [{ method: "GET", url: "https://api.test/s?q=x", timestamp: 1 }] }]),
      {},
    );
    expect(effectsFromRecordingJson(skill.files)[0]).toBe("mutating"); // change → mutating, GET doesn't raise
  });

  test("toReplaySteps fuses the network effect for the run path", () => {
    const steps = toReplaySteps(
      rec([{ type: "click", selectors: [["aria/View details"]], requests: [del] }]),
    );
    expect(steps[0]!.effect).toBe("destructive");
  });
});
