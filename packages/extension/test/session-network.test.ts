import { describe, expect, test } from "vitest";
import { RecordingSession } from "../src/index";

const deps = () => ({ newId: () => "seg", now: () => "2026-07-07T00:00:00.000Z" });

describe("RecordingSession — network correlation (Capture v2)", () => {
  test("correlates recorded requests to timestamped steps on stop", () => {
    const s = new RecordingSession(deps());
    s.start("Delete invoice");
    s.addStep({ type: "click", effect: "mutating", selectors: [["aria/Delete"]], timestamp: 1000 });
    s.recordRequest({ method: "DELETE", url: "https://api.test/invoices/INV-1", timestamp: 1100 });
    const rec = s.stop();
    expect(rec.steps[0]!.requests?.[0]?.method).toBe("DELETE");
  });

  test("does not pollute steps that triggered no request (no empty requests array)", () => {
    const s = new RecordingSession(deps());
    s.start("t");
    s.addStep({ type: "click", effect: "mutating", selectors: [["aria/Go"]], timestamp: 1000 });
    s.recordRequest({ method: "GET", url: "https://api.test/y", timestamp: 9000 }); // outside window
    const rec = s.stop();
    expect(rec.steps[0]!.requests).toBeUndefined();
  });

  test("a recording with no network stream is untouched (requests never added)", () => {
    const s = new RecordingSession(deps());
    s.start("t");
    s.addStep({ type: "click", effect: "mutating", selectors: [["aria/Go"]], timestamp: 1000 });
    const rec = s.stop();
    expect(rec.steps[0]!.requests).toBeUndefined();
  });

  test("ignores requests recorded while not recording", () => {
    const s = new RecordingSession(deps());
    s.recordRequest({ method: "DELETE", url: "https://api.test/x", timestamp: 1 }); // before start
    s.start("t");
    s.addStep({ type: "click", effect: "mutating", selectors: [["aria/Go"]], timestamp: 1000 });
    const rec = s.stop();
    expect(rec.steps[0]!.requests).toBeUndefined();
  });
});
