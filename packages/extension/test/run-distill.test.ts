import { describe, it, expect, vi } from "vitest";
import type { LlmBackend, Recording } from "@skillwright/shared";
import { runDistill } from "../src/pipeline/run-distill";

/**
 * The brief's literal fixture (`{ title: "t", steps: [...] } as any`) omits
 * the required `x-skillwright` namespace. At runtime `distill()` /
 * `distillSemantic()` both call `assertSingleSegment(recording)` as their
 * first statement, which dereferences `recording["x-skillwright"].segment` —
 * on a recording missing that field entirely this throws a TypeError, not a
 * graceful no-op. So this suite adds a valid namespace to the shared fixture
 * to exercise the REAL zero-LLM/semantic distillers rather than that
 * incidental crash. A separate test below (`never throws ... even given a
 * recording missing "x-skillwright" entirely`) deliberately keeps the
 * brief's bare shape to prove runDistill's total zero-LLM path really is
 * total, even in that adversarial case.
 */
const recording: Recording = {
  title: "t",
  steps: [{ type: "click", selectors: [["text/OK"]] }],
  "x-skillwright": {
    version: 1,
    segment: { id: "s", parentSkill: null, recordedAt: "2026-07-09T00:00:00.000Z" },
  },
};

/**
 * Fake backend that returns schema-valid payloads for every pass
 * `distillSemantic` runs (see packages/shared/src/distill/passes.ts and
 * semantic.ts): infer intent, extract params, classify effects, narrate
 * steps — one routed by prompt content, mirroring the `backend()` helper in
 * packages/shared/test/distill-semantic.test.ts. This exercises the REAL
 * semantic path end-to-end (not a `backend.complete` call-spy), so
 * `usedLlm: true` is asserted against real distiller output.
 */
function fakeSemanticBackend(): LlmBackend {
  return {
    name: "fake",
    async complete(prompt: string) {
      if (prompt.includes("TASK: infer intent")) {
        return { title: "Click OK", description: "Clicks the OK button." };
      }
      if (prompt.includes("TASK: extract parameters")) {
        return { params: [] };
      }
      if (prompt.includes("TASK: classify effects")) {
        return { effects: ["readonly"] };
      }
      if (prompt.includes("TASK: narrate steps")) {
        return { steps: [{ description: "Click OK.", agentStep: false }] };
      }
      return {};
    },
  };
}

describe("runDistill", () => {
  it("uses the semantic distiller when a backend is given", async () => {
    const backend = fakeSemanticBackend();
    const out = await runDistill(recording, backend, { name: "demo" });
    expect(out.usedLlm).toBe(true);
    expect(out.llmError).toBeUndefined();
    expect(out.skill.files["SKILL.md"]).toBeTruthy();
  });

  it("falls back to the zero-LLM distiller when the backend throws", async () => {
    const backend = {
      name: "fake",
      complete: vi.fn(async () => {
        throw new Error("rate limited");
      }),
    } as unknown as LlmBackend;
    const out = await runDistill(recording, backend, { name: "demo" });
    expect(out.usedLlm).toBe(false);
    expect(out.llmError).toContain("rate limited");
    expect(out.skill.files["SKILL.md"]).toBeTruthy(); // authoring never hard-blocks
  });

  it("skips the network entirely when no backend is configured", async () => {
    const out = await runDistill(recording, undefined, { name: "demo" });
    expect(out.usedLlm).toBe(false);
    expect(out.llmError).toBeUndefined();
    expect(out.skill.files["SKILL.md"]).toBeTruthy();
  });

  it("never throws even if the zero-LLM path gets a degenerate (empty) recording", async () => {
    const degenerate: Recording = {
      title: "",
      steps: [],
      "x-skillwright": {
        version: 1,
        segment: { id: "s", parentSkill: null, recordedAt: "2026-07-09T00:00:00.000Z" },
      },
    };
    await expect(runDistill(degenerate, undefined)).resolves.toBeTruthy();
  });

  it("never throws even given a recording missing \"x-skillwright\" entirely (rock-bottom fallback)", async () => {
    // The brief's literal fixture shape — `assertSingleSegment` dereferences
    // `recording["x-skillwright"].segment` and throws a TypeError for this
    // input inside BOTH `distill()` and `distillSemantic()`. runDistill must
    // still resolve, never throw or reject.
    const malformed = { title: "", steps: [] } as unknown as Recording;
    await expect(runDistill(malformed, undefined)).resolves.toBeTruthy();
  });

  it("propagates the llmError message verbatim — key-scrubbing is fetch-backend.ts's job, already tested there", async () => {
    const backend = {
      name: "fake",
      complete: vi.fn(async () => {
        throw new Error("boom sk-live-SECRET");
      }),
    } as unknown as LlmBackend;
    const out = await runDistill(recording, backend, { name: "demo" });
    expect(out.usedLlm).toBe(false);
    // Verbatim propagation, not reconstruction: runDistill must not enrich,
    // wrap, or rebuild this string from config (that would risk re-adding the
    // key). It just forwards `err.message` as-is.
    expect(out.llmError).toBe("boom sk-live-SECRET");
  });
});
