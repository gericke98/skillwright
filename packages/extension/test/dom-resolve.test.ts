// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import { resolveElement } from "../src/index";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("resolveElement — bskill selector → element in the page", () => {
  test("aria/<name> resolves via aria-label", () => {
    document.body.innerHTML = `<button aria-label="Delete invoice INV-001">Delete</button>`;
    const el = resolveElement("aria/Delete invoice INV-001", document);
    expect(el).toBe(document.querySelector("button"));
  });

  test("a css selector resolves directly", () => {
    document.body.innerHTML = `<input id="invoice-search" /><button data-testid="d">x</button>`;
    expect(resolveElement("#invoice-search", document)).toBe(document.querySelector("#invoice-search"));
    expect(resolveElement('[data-testid="d"]', document)).toBe(document.querySelector('[data-testid="d"]'));
  });

  test("text/<text> resolves a leaf element by exact trimmed text", () => {
    document.body.innerHTML = `<div><button>Delete</button><button>Cancel</button></div>`;
    const el = resolveElement("text/Delete", document);
    expect(el?.textContent).toBe("Delete");
  });

  test("returns null when nothing matches (never throws)", () => {
    document.body.innerHTML = `<button>Other</button>`;
    expect(resolveElement("aria/Nope", document)).toBeNull();
    expect(resolveElement("#missing", document)).toBeNull();
    expect(resolveElement("text/Ghost", document)).toBeNull();
  });

  test("a label containing a double-quote does not break resolution", () => {
    document.body.innerHTML = `<button aria-label='Say "hi"'>x</button>`;
    expect(resolveElement('aria/Say "hi"', document)).toBe(document.querySelector("button"));
  });
});
