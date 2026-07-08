import { describe, expect, test } from "vitest";
import { classifyStepEffect } from "../src/index";

/**
 * Reasoning about real-world buttons: the destructive-verb list missed several
 * common high-consequence actions. Under-tagging one means the safety gate won't
 * require confirmation — a real safety risk. These must classify as destructive.
 */
const REAL_DESTRUCTIVE_LABELS = [
  "Deactivate account",
  "Terminate subscription",
  "Discard changes",
  "Revoke access",
  "Withdraw application",
  "Erase all data",
  "Uninstall app",
  "Unsubscribe",
  "Disconnect account",
  // already covered — keep as regression
  "Delete invoice",
  "Send message",
  "Pay now",
];

describe("classifyStepEffect — real-world destructive verbs", () => {
  for (const label of REAL_DESTRUCTIVE_LABELS) {
    test(`"${label}" → destructive`, () => {
      expect(classifyStepEffect({ action: "click", label })).toBe("destructive");
    });
  }

  test("a benign label stays non-destructive (no over-broad match)", () => {
    expect(classifyStepEffect({ action: "click", label: "View details" })).not.toBe("destructive");
    expect(classifyStepEffect({ action: "click", label: "Close" })).not.toBe("destructive");
  });
});
