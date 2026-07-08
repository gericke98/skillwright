import { describe, expect, test } from "vitest";
import type { Recording } from "@skillwright/shared";
import { toReplaySteps } from "../src/index";

function rec(steps: Recording["steps"]): Recording {
  return {
    title: "t",
    steps,
    "x-skillwright": {
      version: 1,
      segment: { id: "s", parentSkill: null, recordedAt: "2026-07-07T00:00:00.000Z" },
    },
  };
}

describe("toReplaySteps — recording → flat ReplayStep[]", () => {
  test("flattens each step's selector groups to the primary selector of each", () => {
    const steps = toReplaySteps(
      rec([{ type: "click", effect: "destructive", selectors: [["aria/Del"], ['[data-testid="d"]']] }]),
    );
    expect(steps[0]!.selectors).toEqual(["aria/Del", '[data-testid="d"]']);
  });

  test("carries effect and value through", () => {
    const steps = toReplaySteps(
      rec([{ type: "change", effect: "mutating", selectors: [["aria/Amt"]], value: "500" }]),
    );
    expect(steps[0]!.effect).toBe("mutating");
    expect(steps[0]!.value).toBe("500");
  });

  test("carries a navigation URL through", () => {
    const steps = toReplaySteps(rec([{ type: "navigate", effect: "readonly", url: "https://x.test/" }]));
    expect(steps[0]!.type).toBe("navigate");
    expect(steps[0]!.url).toBe("https://x.test/");
  });

  test("classifies effect when a recording step lacks one", () => {
    const steps = toReplaySteps(rec([{ type: "click", selectors: [["aria/Delete invoice"]] }]));
    expect(steps[0]!.effect).toBe("destructive");
  });
});
