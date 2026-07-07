import { describe, expect, test } from "vitest";
import { redactUrl, redactValue, PLACEHOLDER } from "../src/index";

describe("redactValue — capture-time secret scrubbing (D17)", () => {
  test("a password-type field is always redacted regardless of content", () => {
    expect(redactValue("hunter2", { type: "password" })).toBe(PLACEHOLDER);
  });

  test("an API-key-shaped value in a plain text field is redacted", () => {
    expect(redactValue("sk-live-1234567890ABCDEFghijkl", { type: "text" })).toBe(PLACEHOLDER);
  });

  test("a credit-card-shaped value is redacted", () => {
    expect(redactValue("4111 1111 1111 1111", { type: "text" })).toBe(PLACEHOLDER);
    expect(redactValue("4111111111111111", { type: "text" })).toBe(PLACEHOLDER);
  });

  test("an already-redacted placeholder stays a placeholder", () => {
    expect(redactValue(PLACEHOLDER, { type: "text" })).toBe(PLACEHOLDER);
  });

  test("an ordinary value passes through untouched", () => {
    expect(redactValue("INV-001", { type: "text" })).toBe("INV-001");
    expect(redactValue("Acme Corp", { type: "text" })).toBe("Acme Corp");
  });
});

describe("redactUrl — secrets in URLs (D17)", () => {
  test("a token query param value is redacted, structure preserved", () => {
    const out = redactUrl("https://app.test/x?token=abcdef123456&page=2");
    expect(out).toContain("token=" + PLACEHOLDER);
    expect(out).toContain("page=2");
    expect(out).not.toContain("abcdef123456");
  });

  test("multiple sensitive params are all redacted", () => {
    const out = redactUrl("https://app.test/x?access_token=aaa&api_key=bbb&q=hello");
    expect(out).not.toContain("aaa");
    expect(out).not.toContain("bbb");
    expect(out).toContain("q=hello");
  });

  test("a URL with no sensitive params is unchanged", () => {
    const url = "https://app.test/invoices?page=2&sort=date";
    expect(redactUrl(url)).toBe(url);
  });

  test("a non-URL string is returned unchanged (never throws)", () => {
    expect(redactUrl("not a url")).toBe("not a url");
  });
});
