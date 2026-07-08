import { describe, expect, test } from "vitest";
import { redactValue, redactUrl, PLACEHOLDER } from "../src/index";

/**
 * Adversarial battery: every one of these MUST be redacted. A failure here is a
 * real credential-leak gap, not a style nit. Mirrors the D15 intent at the
 * capture layer (the M2 eval suite runs the analogous battery through distill).
 */
const MUST_REDACT_VALUES: Array<[string, string]> = [
  ["AWS access key id", "AKIAIOSFODNN7EXAMPLE"],
  ["GitHub PAT", "ghp_16CharsAndMoreAlnum1234567890"],
  ["Slack bot token", "xoxb-123456789012-abcdefABCDEF"],
  ["JWT", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payloadpart.sigpart"],
  ["Google API key", "AIzaSyD-ExampleKey_1234567890abcdefg"],
  ["Stripe secret key", "sk-live-51ABCdefGHIjklMNOpqr"],
  ["Visa test card", "4111111111111111"],
  ["Mastercard test card", "5555 5555 5555 4444"],
];

describe("adversarial redaction battery — capture layer", () => {
  for (const [name, value] of MUST_REDACT_VALUES) {
    test(`redacts ${name}`, () => {
      expect(redactValue(value, { type: "text" })).toBe(PLACEHOLDER);
    });
    test(`redacts ${name} when carried in a URL param`, () => {
      const out = redactUrl(`https://app.test/cb?data=${encodeURIComponent(value)}`);
      expect(out).not.toContain(value.replace(/\s/g, ""));
    });
  }

  test("does NOT redact benign business values (no false positives on these)", () => {
    for (const benign of ["INV-001", "Acme Corp", "2026-07-06", "Approve", "42"]) {
      expect(redactValue(benign, { type: "text" })).toBe(benign);
    }
  });
});
