import { describe, expect, test } from "vitest";
import { classifyStepEffect } from "../src/index";

/**
 * These are the SAFETY INVARIANTS the classifier must never violate. The exact
 * verb vocabulary and role handling are an implementation choice, but every
 * case below must hold or the replay safety gate can be defeated.
 */
describe("classifyStepEffect — safety invariants", () => {
  test("a control labelled with an irreversible verb is destructive", () => {
    expect(classifyStepEffect({ action: "click", label: "Delete invoice" })).toBe("destructive");
    expect(classifyStepEffect({ action: "click", label: "Send payment" })).toBe("destructive");
    expect(classifyStepEffect({ action: "click", label: "Pay now" })).toBe("destructive");
  });

  test("editing a field is at least mutating (never readonly)", () => {
    const effect = classifyStepEffect({ action: "change", label: "Amount" });
    expect(["mutating", "destructive"]).toContain(effect);
  });

  test("a pure navigation / scroll with no side effect is readonly", () => {
    expect(classifyStepEffect({ action: "scroll" })).toBe("readonly");
  });

  test("an unknown action with no label rounds UP to destructive", () => {
    expect(classifyStepEffect({ action: "mystery-action" })).toBe("destructive");
  });
});
