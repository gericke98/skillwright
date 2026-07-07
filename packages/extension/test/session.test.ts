import { describe, expect, test } from "vitest";
import { assertSingleSegment, type Step } from "@bskill/shared";
import { RecordingSession } from "../src/index";

function fixedDeps() {
  return { newId: () => "seg-fixed", now: () => "2026-07-07T00:00:00.000Z" };
}

const clickStep: Step = { type: "click", effect: "mutating", selectors: [["aria/Go"]] };

describe("RecordingSession", () => {
  test("assembles a valid single-segment Recording on stop", () => {
    const s = new RecordingSession(fixedDeps());
    s.start("Delete invoice");
    s.addStep(clickStep);
    const rec = s.stop();
    expect(rec.title).toBe("Delete invoice");
    expect(rec.steps).toEqual([clickStep]);
    expect(rec["x-bskill"].segment).toEqual({
      id: "seg-fixed",
      parentSkill: null,
      recordedAt: "2026-07-07T00:00:00.000Z",
    });
    expect(() => assertSingleSegment(rec)).not.toThrow();
  });

  test("tracks a live step count", () => {
    const s = new RecordingSession(fixedDeps());
    s.start("t");
    expect(s.stepCount).toBe(0);
    s.addStep(clickStep);
    s.addStep(clickStep);
    expect(s.stepCount).toBe(2);
  });

  test("navigation steps store a redacted URL", () => {
    const s = new RecordingSession(fixedDeps());
    s.start("t");
    s.addNavigation("https://app.test/cb?access_token=SECRETtokenvalue12345");
    const rec = s.stop();
    const nav = rec.steps[0]!;
    expect(nav.type).toBe("navigate");
    expect(nav.effect).toBe("readonly");
    expect(JSON.stringify(nav)).not.toContain("SECRETtokenvalue12345");
  });

  test("addStep before start is rejected (no silent capture)", () => {
    const s = new RecordingSession(fixedDeps());
    expect(() => s.addStep(clickStep)).toThrow();
  });

  test("stop before start is rejected", () => {
    const s = new RecordingSession(fixedDeps());
    expect(() => s.stop()).toThrow();
  });

  test("isRecording reflects state across start/stop", () => {
    const s = new RecordingSession(fixedDeps());
    expect(s.isRecording).toBe(false);
    s.start("t");
    expect(s.isRecording).toBe(true);
    s.stop();
    expect(s.isRecording).toBe(false);
  });
});
