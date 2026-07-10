import { describe, expect, test } from "vitest";
import type { FinalParam, Recording, SkillDirectory } from "@skillwright/shared";
import { advance, initialState, type PipelineState } from "../src/pipeline/state";

const recording: Recording = {
  title: "Delete invoice",
  steps: [{ type: "click", selectors: [["aria/Delete"]] }],
  "x-skillwright": {
    version: 1,
    segment: { id: "seg-1", parentSkill: null, recordedAt: "2026-07-09T00:00:00.000Z" },
  },
};

const distilledSkill: SkillDirectory = {
  slug: "delete-invoice",
  files: { "SKILL.md": "# Delete invoice" },
};

const scriptedSkill: SkillDirectory = {
  slug: "delete-invoice",
  files: { "SKILL.md": "# Delete invoice", "script.ts": "export default async () => {};" },
};

const params: FinalParam[] = [
  {
    name: "invoiceId",
    type: "string",
    required: true,
    demoValue: "INV-001",
    rationale: "identifies the target invoice",
    confidence: "high",
  },
];

describe("initialState", () => {
  test("starts at the record stage with no payloads or error", () => {
    expect(initialState()).toEqual({ stage: "record" });
  });
});

describe("advance — happy path", () => {
  test("walks record -> distill -> parameterize -> script -> export -> verify", () => {
    let state = initialState();

    state = advance(state, { kind: "recorded", recording });
    expect(state).toEqual({ stage: "distill", recording });

    state = advance(state, { kind: "distilled", skill: distilledSkill });
    expect(state).toEqual({ stage: "parameterize", recording, skill: distilledSkill });

    state = advance(state, { kind: "parameterized", params });
    expect(state).toEqual({ stage: "script", recording, skill: distilledSkill, params });

    state = advance(state, { kind: "scripted", skill: scriptedSkill });
    expect(state).toEqual({ stage: "export", recording, skill: scriptedSkill, params });

    state = advance(state, { kind: "exported" });
    expect(state).toEqual({ stage: "verify", recording, skill: scriptedSkill, params });

    state = advance(state, { kind: "verified" });
    expect(state).toEqual({ stage: "verify", recording, skill: scriptedSkill, params });
  });
});

describe("advance — failure handling", () => {
  test("a failed event records the error and KEEPS the current stage", () => {
    const start: PipelineState = { stage: "distill", recording };
    const next = advance(start, { kind: "failed", error: "distill LLM call timed out" });
    expect(next).toEqual({ stage: "distill", recording, error: "distill LLM call timed out" });
  });

  test("advance never throws even for a failed event with no prior payload", () => {
    expect(() => advance(initialState(), { kind: "failed", error: "boom" })).not.toThrow();
  });

  test("a later successful transition clears a stale error", () => {
    const errored: PipelineState = { stage: "distill", recording, error: "distill LLM call timed out" };
    const next = advance(errored, { kind: "distilled", skill: distilledSkill });
    expect(next).toEqual({ stage: "parameterize", recording, skill: distilledSkill });
    expect(next.error).toBeUndefined();
  });
});

describe("advance — out-of-order events are a no-op, not a crash", () => {
  test("a parameterized event while still in record is ignored (state unchanged)", () => {
    const start = initialState();
    const next = advance(start, { kind: "parameterized", params });
    expect(next).toEqual(start);
  });

  test("a scripted event while still in distill is ignored (state unchanged)", () => {
    const start: PipelineState = { stage: "distill", recording };
    const next = advance(start, { kind: "scripted", skill: scriptedSkill });
    expect(next).toEqual(start);
  });

  test("an exported event while still in parameterize is ignored (state unchanged)", () => {
    const start: PipelineState = { stage: "parameterize", recording, skill: distilledSkill };
    const next = advance(start, { kind: "exported" });
    expect(next).toEqual(start);
  });

  test("does not throw on any out-of-order event", () => {
    expect(() => advance(initialState(), { kind: "verified" })).not.toThrow();
    expect(() => advance(initialState(), { kind: "exported" })).not.toThrow();
  });
});

describe("advance — purity and immutability", () => {
  test("does not mutate the input state object (deep-frozen input stays intact)", () => {
    const start: PipelineState = { stage: "distill", recording };
    Object.freeze(start);
    Object.freeze(start.recording);
    Object.freeze(start.recording!.steps);

    // Would throw under strict mode if `advance` attempted an in-place write.
    const next = advance(start, { kind: "distilled", skill: distilledSkill });

    expect(start).toEqual({ stage: "distill", recording });
    expect(next).not.toBe(start);
  });

  test("returns a new object even for a no-op (out-of-order) transition", () => {
    const start: PipelineState = { stage: "record" };
    Object.freeze(start);
    const next = advance(start, { kind: "parameterized", params });
    expect(start).toEqual({ stage: "record" });
    expect(next).toEqual({ stage: "record" });
  });

  test("does not mutate the input state object when handling a failed event", () => {
    const start: PipelineState = { stage: "script", recording, skill: distilledSkill, params };
    const snapshot = JSON.parse(JSON.stringify(start));
    Object.freeze(start);

    const next = advance(start, { kind: "failed", error: "export failed" });

    expect(start).toEqual(snapshot);
    expect(next).not.toBe(start);
    expect(next).toEqual({ ...snapshot, error: "export failed" });
  });
});

describe("advance — reset", () => {
  test("reset returns to the initial state regardless of current stage/payloads", () => {
    const deep: PipelineState = {
      stage: "verify",
      recording,
      skill: scriptedSkill,
      params,
      error: "some stale error",
    };
    expect(advance(deep, { kind: "reset" })).toEqual(initialState());
  });
});

describe("advance — payload accumulation", () => {
  test("later stages retain earlier payloads (recording + skill still present at parameterize)", () => {
    let state = initialState();
    state = advance(state, { kind: "recorded", recording });
    state = advance(state, { kind: "distilled", skill: distilledSkill });
    expect(state.recording).toEqual(recording);
    expect(state.skill).toEqual(distilledSkill);

    state = advance(state, { kind: "parameterized", params });
    expect(state.recording).toEqual(recording);
    expect(state.skill).toEqual(distilledSkill);
    expect(state.params).toEqual(params);
  });

  test("scripted REPLACES skill with the script-bearing SkillDirectory", () => {
    let state: PipelineState = { stage: "script", recording, skill: distilledSkill, params };
    state = advance(state, { kind: "scripted", skill: scriptedSkill });
    expect(state.skill).toEqual(scriptedSkill);
    expect(state.skill).not.toEqual(distilledSkill);
  });
});
