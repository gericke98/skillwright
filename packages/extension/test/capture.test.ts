// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import { buildCaptureStep } from "../src/index";

beforeEach(() => {
  document.body.innerHTML = "";
});

function el(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}

describe("buildCaptureStep — event → recording step (§5.2)", () => {
  test("a click on a delete control yields a destructive step with a selector stack", () => {
    const button = el(`<button aria-label="Delete invoice INV-001" data-testid="del">Delete</button>`);
    const step = buildCaptureStep(button, "click");
    expect(step.type).toBe("click");
    expect(step.effect).toBe("destructive");
    expect(step.selectors?.[0]).toEqual(["aria/Delete invoice INV-001"]);
    expect(step.value).toBeUndefined();
  });

  test("a change on a password field records a redacted value, tagged mutating", () => {
    const input = el(`<input type="password" aria-label="Password" value="hunter2" />`) as HTMLInputElement;
    const step = buildCaptureStep(input, "change");
    expect(step.effect).toBe("mutating");
    expect(step.value).toBe("{secret}");
  });

  test("a change on a plain field keeps a benign value", () => {
    const input = el(`<input type="text" aria-label="Amount" value="500" />`) as HTMLInputElement;
    const step = buildCaptureStep(input, "change");
    expect(step.value).toBe("500");
  });

  test("selectors are wrapped as string[][] to match the recording schema", () => {
    const button = el(`<button aria-label="Go" id="g1">Go</button>`);
    const step = buildCaptureStep(button, "click");
    expect(Array.isArray(step.selectors)).toBe(true);
    for (const group of step.selectors!) {
      expect(Array.isArray(group)).toBe(true);
    }
  });
});
