import type { CdpLike } from "@skillwright/shared";

/** The subset of `chrome.debugger` the CDP adapter needs. */
export interface ChromeDebuggerLike {
  sendCommand(target: { tabId: number }, method: string, params?: object): Promise<unknown>;
  onEvent: {
    addListener(cb: (source: { tabId?: number }, method: string, params?: unknown) => void): void;
  };
}

/**
 * Adapt `chrome.debugger` (for one tab) to the shared `CdpLike` interface, so the
 * extension's passive network observer reuses the exact same `NetworkCapturer`
 * that's verified end-to-end against Playwright's CDPSession. Events from other
 * tabs are ignored.
 */
export function chromeDebuggerCdp(dbg: ChromeDebuggerLike, tabId: number): CdpLike {
  const handlers: Record<string, Array<(params: unknown) => void>> = {};
  dbg.onEvent.addListener((source, method, params) => {
    if (source.tabId !== tabId) return;
    for (const h of handlers[method] ?? []) h(params);
  });
  return {
    send: (method, params) => dbg.sendCommand({ tabId }, method, params as object | undefined),
    on: (event, handler) => {
      (handlers[event] ??= []).push(handler);
    },
  };
}
