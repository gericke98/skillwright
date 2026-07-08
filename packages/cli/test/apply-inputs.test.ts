import { describe, expect, test } from "vitest";
import { applyInputs, MissingInputError, type ReplayStep } from "../src/index";

const steps = (): ReplayStep[] => [
  { type: "navigate", effect: "readonly", selectors: [], url: "https://erp.test/invoices" },
  { type: "change", effect: "mutating", selectors: ["aria/Invoice number"], value: "{invoice_number}" },
  { type: "click", effect: "destructive", selectors: ["aria/Approve invoice {invoice_number}"] },
];

describe("applyInputs — runtime parameter substitution", () => {
  test("substitutes a placeholder in a step value", () => {
    const out = applyInputs(steps(), { invoice_number: "INV-1042" });
    expect(out[1]!.value).toBe("INV-1042");
  });

  test("substitutes placeholders inside selectors too", () => {
    const out = applyInputs(steps(), { invoice_number: "INV-1042" });
    expect(out[2]!.selectors[0]).toBe("aria/Approve invoice INV-1042");
  });

  test("leaves steps without placeholders untouched", () => {
    const out = applyInputs(steps(), { invoice_number: "INV-1042" });
    expect(out[0]!.url).toBe("https://erp.test/invoices");
  });

  test("throws MissingInputError when a required placeholder has no value", () => {
    expect(() => applyInputs(steps(), {})).toThrow(MissingInputError);
  });

  test("the error names the missing input", () => {
    try {
      applyInputs(steps(), {});
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as MissingInputError).message).toContain("invoice_number");
    }
  });

  test("does not treat an already-redacted {secret} placeholder as a missing input", () => {
    const s: ReplayStep[] = [{ type: "change", effect: "mutating", selectors: ["aria/API key"], value: "{secret}" }];
    // {secret} is not a user input — it stays as-is (a secret the user must supply another way),
    // and must not block the run as a "missing input".
    const out = applyInputs(s, {});
    expect(out[0]!.value).toBe("{secret}");
  });

  test("multiple distinct placeholders are all substituted", () => {
    const s: ReplayStep[] = [
      { type: "change", effect: "mutating", selectors: ["aria/To"], value: "{recipient}" },
      { type: "change", effect: "mutating", selectors: ["aria/Body"], value: "Hi {recipient}, re {topic}" },
    ];
    const out = applyInputs(s, { recipient: "ops@test", topic: "Q3" });
    expect(out[1]!.value).toBe("Hi ops@test, re Q3");
  });
});
