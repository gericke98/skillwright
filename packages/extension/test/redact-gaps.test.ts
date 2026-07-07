import { describe, expect, test } from "vitest";
import { redactValue, redactUrl, PLACEHOLDER } from "../src/index";

/**
 * Regression tests for credential-leak gaps found reviewing the redaction
 * heuristics. Each MUST redact; a failure is a real leak.
 */
describe("redaction gap: OAuth tokens in the URL fragment", () => {
  test("implicit-flow access_token in the #fragment is redacted", () => {
    const out = redactUrl(
      "https://app.test/callback#access_token=ya29SECRETtokenvalue123&token_type=bearer",
    );
    expect(out).not.toContain("ya29SECRETtokenvalue123");
    expect(out).toContain("access_token=" + PLACEHOLDER);
    expect(out).toContain("token_type=bearer");
  });

  test("id_token in the fragment is redacted even with no query string", () => {
    const out = redactUrl("https://app.test/cb#id_token=eyJhbGciOiJIUzI1NiJ9.body.sig");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9.body.sig");
  });
});

describe("redaction gap: secret in a URL path segment", () => {
  test("a secret-shaped path segment is redacted", () => {
    const out = redactUrl("https://app.test/reset/sk-live-ABCdef1234567890ghij/confirm");
    expect(out).not.toContain("sk-live-ABCdef1234567890ghij");
  });

  test("an ordinary path is left unchanged", () => {
    const url = "https://app.test/invoices/INV-001/edit";
    expect(redactUrl(url)).toBe(url);
  });
});

describe("redaction gap: secret embedded in a longer field value", () => {
  test("a Bearer token pasted into a text field is redacted", () => {
    const out = redactValue("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature", {
      type: "text",
    });
    expect(out).toBe(PLACEHOLDER);
  });

  test("an API key embedded mid-sentence is redacted", () => {
    const out = redactValue("use key ghp_abcdefghijklmnopqrstuvwxyz0123456789 to auth", {
      type: "text",
    });
    expect(out).toBe(PLACEHOLDER);
  });
});
