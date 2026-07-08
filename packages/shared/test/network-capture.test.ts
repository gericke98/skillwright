import { describe, expect, test } from "vitest";
import { cdpRequestToCaptured, NetworkCapturer, type CdpRequestEvent } from "../src/index";

const ev = (method: string, url: string, type = "XHR"): CdpRequestEvent => ({
  request: { method, url },
  type,
});

describe("cdpRequestToCaptured", () => {
  test("maps a CDP requestWillBeSent to a CapturedRequest, redacting the URL", () => {
    const out = cdpRequestToCaptured(ev("DELETE", "https://api.test/invoices/INV-1?token=SEKRET_TOKEN_abc123"), 1000);
    expect(out.method).toBe("DELETE");
    expect(out.resourceType).toBe("XHR");
    expect(out.timestamp).toBe(1000);
    expect(out.url).not.toContain("SEKRET_TOKEN_abc123"); // redacted
  });
});

describe("NetworkCapturer", () => {
  /** A fake CDP session: records sent commands, lets the test emit events. */
  function fakeSession() {
    const handlers: Record<string, (p: unknown) => void> = {};
    const sent: string[] = [];
    return {
      sent,
      emit(event: string, params: unknown) {
        handlers[event]?.(params);
      },
      session: {
        send: async (method: string) => {
          sent.push(method);
        },
        on: (event: string, handler: (p: unknown) => void) => {
          handlers[event] = handler;
        },
      },
    };
  }

  test("enables the Network domain and collects requests as they fire", async () => {
    const fake = fakeSession();
    let clock = 500;
    const capturer = new NetworkCapturer(() => (clock += 100));
    await capturer.attach(fake.session);

    expect(fake.sent).toContain("Network.enable");

    fake.emit("Network.requestWillBeSent", ev("GET", "https://api.test/search?q=x"));
    fake.emit("Network.requestWillBeSent", ev("DELETE", "https://api.test/invoices/INV-1"));

    const got = capturer.collected();
    expect(got.map((r) => r.method)).toEqual(["GET", "DELETE"]);
    expect(got[0]!.timestamp).toBeLessThan(got[1]!.timestamp); // stamped in order
  });

  test("collected() returns a copy (callers cannot mutate internal state)", async () => {
    const fake = fakeSession();
    const capturer = new NetworkCapturer(() => 1);
    await capturer.attach(fake.session);
    fake.emit("Network.requestWillBeSent", ev("GET", "https://api.test/x"));
    capturer.collected().push(ev("POST", "https://evil") as never);
    expect(capturer.collected()).toHaveLength(1);
  });
});
