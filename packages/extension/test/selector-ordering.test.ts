// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { computeSelectorStack } from "../src/index";

/**
 * Dogfooding a real login page surfaced this: a submit button with visible text
 * but no aria/id/test-attr was getting a brittle deep `nth-of-type` CSS path
 * ranked ABOVE its stable `text/Login`. Visible text survives layout changes;
 * a positional CSS path breaks on any DOM reorder — so text must rank higher.
 */
describe("computeSelectorStack — stable text ranks above positional CSS", () => {
  test("a text-only element ranks text/ before the nth-of-type CSS path", () => {
    document.body.innerHTML = `
      <div><div><form>
        <div><div><button type="submit">Login</button></div></div>
      </form></div></div>`;
    const btn = document.querySelector("button")!;
    const stack = computeSelectorStack(btn);

    const textIdx = stack.findIndex((s) => s === "text/Login");
    const cssIdx = stack.findIndex((s) => s.includes("nth-of-type"));
    expect(textIdx).toBeGreaterThanOrEqual(0);
    expect(cssIdx).toBeGreaterThanOrEqual(0);
    expect(textIdx).toBeLessThan(cssIdx); // text is the more stable anchor
  });

  test("a stable id still outranks everything", () => {
    document.body.innerHTML = `<button id="go">Go</button>`;
    const stack = computeSelectorStack(document.querySelector("button")!);
    expect(stack[0]).toBe("#go");
  });

  // Found dogfooding a real SPA: an input identified only by its placeholder
  // (inputs have no textContent) was getting a brittle positional path.
  test("an input with only a placeholder gets a stable [placeholder=...] anchor", () => {
    document.body.innerHTML = `<div><header><input placeholder="What needs to be done?"></header></div>`;
    const stack = computeSelectorStack(document.querySelector("input")!);
    expect(stack[0]).toBe('[placeholder="What needs to be done?"]');
  });

  test("a form field's name is a stable anchor, ranked above placeholder", () => {
    document.body.innerHTML = `<input name="email" placeholder="you@site.com" type="text">`;
    const stack = computeSelectorStack(document.querySelector("input")!);
    const nameIdx = stack.indexOf('[name="email"]');
    const phIdx = stack.indexOf('[placeholder="you@site.com"]');
    expect(nameIdx).toBeGreaterThanOrEqual(0);
    expect(nameIdx).toBeLessThan(phIdx);
  });
});
