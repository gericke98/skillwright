import { describe, expect, test } from "vitest";
import { assertSingleSegment, MultiSegmentError } from "../src/index";
import type { Recording } from "../src/index";

function baseRecording(overrides: Partial<Recording["x-skillwright"]["segment"]> = {}): Recording {
  return {
    title: "approve-invoice",
    steps: [{ type: "click", selectors: [["aria/Approve"]] }],
    "x-skillwright": {
      version: 1,
      segment: {
        id: "seg-1",
        parentSkill: null,
        recordedAt: "2026-07-06T00:00:00.000Z",
        ...overrides,
      },
    },
  };
}

describe("assertSingleSegment", () => {
  test("accepts a new skill's first segment (parentSkill: null)", () => {
    expect(() => assertSingleSegment(baseRecording())).not.toThrow();
  });

  test("throws MultiSegmentError when the recording attaches to an existing skill", () => {
    const rescueSegment = baseRecording({ parentSkill: "approve-invoice" });
    expect(() => assertSingleSegment(rescueSegment)).toThrow(MultiSegmentError);
  });

  test("throws loudly, never silently drops, on an unrecognized multi-segment array", () => {
    const future = baseRecording();
    // A newer skillwright may emit an explicit segments[] list; v1 must refuse it.
    (future["x-skillwright"] as unknown as { segments: unknown[] }).segments = [{}, {}];
    expect(() => assertSingleSegment(future)).toThrow(MultiSegmentError);
  });

  test("the error message names the cause so the user knows it was recorded with a newer skillwright", () => {
    const rescueSegment = baseRecording({ parentSkill: "approve-invoice" });
    expect(() => assertSingleSegment(rescueSegment)).toThrow(/newer skillwright/i);
  });
});
