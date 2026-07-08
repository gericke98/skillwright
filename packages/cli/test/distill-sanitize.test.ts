import { describe, expect, test } from "vitest";
import type { Recording } from "@skillwright/shared";
import { summarizeSteps, scrubText } from "../src/distill/sanitize";

function rec(steps: Recording["steps"]): Recording {
  return {
    title: "Demo",
    steps,
    "x-skillwright": {
      version: 1,
      segment: { id: "s", parentSkill: null, recordedAt: "2026-07-07T00:00:00.000Z" },
    },
  };
}

describe("summarizeSteps — the redacted view sent to the LLM", () => {
  test("never exposes a secret-shaped value to the prompt", () => {
    const summary = summarizeSteps(
      rec([{ type: "change", selectors: [["aria/API key"]], value: "sk-live-ABCdef1234567890" }]),
    );
    expect(summary[0]!.value).toBe("{secret}");
    expect(summary[0]!.label).toBe("API key");
  });

  test("redacts tokens embedded in a navigate URL", () => {
    const summary = summarizeSteps(
      rec([{ type: "navigate", url: "https://app.test/cb?access_token=ya29.SEKRET_TOKEN_ABC123" }]),
    );
    expect(summary[0]!.url).not.toContain("ya29.SEKRET_TOKEN_ABC123");
  });

  test("passes ordinary demo values through untouched", () => {
    const summary = summarizeSteps(
      rec([{ type: "change", selectors: [["aria/Invoice number"]], value: "INV-1042" }]),
    );
    expect(summary[0]!.value).toBe("INV-1042");
  });
});

describe("scrubText — second-pass net over rendered files", () => {
  test("removes a secret token that leaked into rendered prose", () => {
    const out = scrubText("The key is sk-live-ABCdef1234567890 — keep it safe.");
    expect(out).not.toContain("sk-live-ABCdef1234567890");
    expect(out).toContain("{secret}");
  });

  test("leaves benign text unchanged", () => {
    const text = "Click Approve to release invoice INV-1042.";
    expect(scrubText(text)).toBe(text);
  });
});
