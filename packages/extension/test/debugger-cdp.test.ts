import { describe, expect, test, vi } from "vitest";
import { NetworkCapturer } from "@skillwright/shared";
import { chromeDebuggerCdp, type ChromeDebuggerLike } from "../src/debugger-cdp";

/** A fake chrome.debugger that lets the test emit CDP events. */
function fakeDebugger() {
  let listener: ((source: { tabId?: number }, method: string, params?: unknown) => void) | undefined;
  const sendCommand = vi.fn(async () => ({}));
  const dbg: ChromeDebuggerLike = {
    sendCommand,
    onEvent: {
      addListener: (cb) => {
        listener = cb;
      },
    },
  };
  return {
    dbg,
    sendCommand,
    emit: (tabId: number, method: string, params: unknown) => listener?.({ tabId }, method, params),
  };
}

const reqEvent = (method: string) => ({ request: { method, url: "https://api.test/x" }, type: "XHR" });

describe("chromeDebuggerCdp — CdpLike over chrome.debugger", () => {
  test("routes Network events for its tab into a NetworkCapturer", async () => {
    const fake = fakeDebugger();
    const cdp = chromeDebuggerCdp(fake.dbg, 42);
    const capturer = new NetworkCapturer(() => 1);
    await capturer.attach(cdp);

    expect(fake.sendCommand).toHaveBeenCalledWith({ tabId: 42 }, "Network.enable", undefined);

    fake.emit(42, "Network.requestWillBeSent", reqEvent("DELETE"));
    expect(capturer.collected().map((r) => r.method)).toEqual(["DELETE"]);
  });

  test("ignores events from other tabs", async () => {
    const fake = fakeDebugger();
    const cdp = chromeDebuggerCdp(fake.dbg, 42);
    const capturer = new NetworkCapturer(() => 1);
    await capturer.attach(cdp);

    fake.emit(99, "Network.requestWillBeSent", reqEvent("POST")); // other tab
    expect(capturer.collected()).toHaveLength(0);
  });
});
