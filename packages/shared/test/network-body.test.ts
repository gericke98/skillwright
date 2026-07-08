import { describe, expect, test } from "vitest";
import { cdpRequestToCaptured, type CdpRequestEvent } from "../src/index";

const ev = (postData?: string): CdpRequestEvent => ({
  request: { method: "POST", url: "https://api.test/invoices", postData },
  type: "Fetch",
});

describe("cdpRequestToCaptured — request body", () => {
  test("captures an inline request body", () => {
    const out = cdpRequestToCaptured(ev('{"invoice":"INV-1042","amount":500}'), 1);
    expect(out.body).toBe('{"invoice":"INV-1042","amount":500}');
  });

  test("redacts secret-shaped tokens in the body", () => {
    const out = cdpRequestToCaptured(ev('{"api_key":"sk-live-ABCdef1234567890ghij"}'), 1);
    expect(out.body).not.toContain("sk-live-ABCdef1234567890ghij");
    expect(out.body).toContain("{secret}");
  });

  test("omits body when there is no post data", () => {
    const out = cdpRequestToCaptured(ev(undefined), 1);
    expect(out.body).toBeUndefined();
  });
});
