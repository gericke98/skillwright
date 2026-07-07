import { describe, expect, test } from "vitest";
import { translateSelector } from "../src/index";

describe("translateSelector — bskill selector string → Playwright locator descriptor", () => {
  test("aria/<name> becomes a label locator", () => {
    expect(translateSelector("aria/Delete invoice INV-001")).toEqual({
      kind: "label",
      value: "Delete invoice INV-001",
    });
  });

  test("text/<text> becomes a text locator", () => {
    expect(translateSelector("text/Delete")).toEqual({ kind: "text", value: "Delete" });
  });

  test("a test-attribute selector passes through as css", () => {
    expect(translateSelector('[data-testid="delete-invoice"]')).toEqual({
      kind: "css",
      value: '[data-testid="delete-invoice"]',
    });
  });

  test("an id selector passes through as css", () => {
    expect(translateSelector("#invoice-search")).toEqual({ kind: "css", value: "#invoice-search" });
  });

  test("a CSS path passes through as css", () => {
    const css = "main:nth-of-type(1) > table:nth-of-type(1) > tbody > tr > td > button:nth-of-type(2)";
    expect(translateSelector(css)).toEqual({ kind: "css", value: css });
  });
});
