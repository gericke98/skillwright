import { describe, expect, test } from "vitest";
import { redactUrl } from "../src/index";

/**
 * Found by dogfooding real traffic: when the page URL carries a token, analytics
 * beacons forward the whole URL URL-ENCODED inside one of their own query params
 * (e.g. `?n=https%3A%2F%2Fsite%2F%3Faccess_token%3D<token>`). The nested token
 * must not survive redaction.
 */
describe("redactUrl — secrets nested inside a query param value", () => {
  test("redacts a token embedded url-encoded in a tracking param", () => {
    const original = "https://the-internet.test/?access_token=ya29.SEKRET_TOKEN_abc123XYZ&ok=1";
    const beacon = `https://analytics.test/event?n=${encodeURIComponent(original)}&t=123`;
    const out = redactUrl(beacon);
    expect(out).not.toContain("ya29.SEKRET_TOKEN_abc123XYZ");
    expect(out).toContain("t=123"); // benign params survive
  });

  test("redacts an api-key-shaped token nested in a param", () => {
    const beacon = "https://track.test/e?ref=" + encodeURIComponent("go?key=sk-live-ABCdef1234567890ghij");
    expect(redactUrl(beacon)).not.toContain("sk-live-ABCdef1234567890ghij");
  });

  test("leaves a benign nested url untouched", () => {
    const out = redactUrl("https://track.test/e?ref=" + encodeURIComponent("https://example.com/page?id=42"));
    expect(out).toContain("42");
  });
});
