// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import { computeSelectorStack } from "../src/index";

function setBody(html: string): void {
  document.body.innerHTML = html;
}

beforeEach(() => setBody(""));

describe("computeSelectorStack — ordered, most-stable-first (§5.2)", () => {
  test("ARIA role+name comes first when the element has an accessible name", () => {
    setBody(`<button aria-label="Approve invoice INV-001" data-testid="approve" id="a1">Approve</button>`);
    const el = document.querySelector("button")!;
    const stack = computeSelectorStack(el);
    expect(stack[0]).toBe("aria/Approve invoice INV-001");
  });

  test("test attributes rank above id and raw CSS", () => {
    setBody(`<button data-testid="approve" id="a1">Go</button>`);
    const el = document.querySelector("button")!;
    const stack = computeSelectorStack(el);
    const testIdx = stack.indexOf('[data-testid="approve"]');
    const idIdx = stack.indexOf("#a1");
    expect(testIdx).toBeGreaterThanOrEqual(0);
    expect(idIdx).toBeGreaterThanOrEqual(0);
    expect(testIdx).toBeLessThan(idIdx);
  });

  test("recognizes every supported test-attribute name", () => {
    for (const attr of ["data-testid", "data-test", "data-qa", "data-cy"]) {
      setBody(`<button ${attr}="x">Go</button>`);
      const el = document.querySelector("button")!;
      expect(computeSelectorStack(el)).toContain(`[${attr}="x"]`);
    }
  });

  test("falls back to a CSS path when there is no id, test attr, or aria name", () => {
    setBody(`<div><section><button>Plain</button></section></div>`);
    const el = document.querySelector("button")!;
    const stack = computeSelectorStack(el);
    // Some CSS-path selector must resolve back to exactly this element.
    const css = stack.find((s) => !s.startsWith("aria/") && !s.startsWith("text/"));
    expect(css).toBeDefined();
    expect(document.querySelector(css!)).toBe(el);
  });

  test("includes a visible-text selector for elements with text", () => {
    setBody(`<button>Delete</button>`);
    const el = document.querySelector("button")!;
    expect(computeSelectorStack(el)).toContain("text/Delete");
  });

  test("every selector in the stack is unique and non-empty", () => {
    setBody(`<button aria-label="Go" data-testid="g" id="g1">Go</button>`);
    const el = document.querySelector("button")!;
    const stack = computeSelectorStack(el);
    expect(stack.length).toBeGreaterThan(0);
    expect(new Set(stack).size).toBe(stack.length);
    expect(stack.every((s) => s.length > 0)).toBe(true);
  });
});
