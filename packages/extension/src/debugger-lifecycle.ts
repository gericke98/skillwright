import type { CdpLike } from "@skillwright/shared";

/** Debuggee identifier — mirrors `chrome.debugger.Debuggee` (a subset). */
export interface DebuggeeLike {
  tabId?: number;
}

/** The subset of `chrome.debugger` this lifecycle needs. Kept minimal and
 * injectable (no reaching for the global `chrome`) so it's unit-testable. */
export interface DebuggerLifecycleDbg {
  sendCommand(target: { tabId: number }, method: string, params?: object): Promise<unknown>;
  onEvent: {
    addListener(cb: (source: DebuggeeLike, method: string, params?: unknown) => void): void;
  };
  onDetach: {
    addListener(cb: (source: DebuggeeLike, reason: string) => void): void;
  };
}

export interface DebuggerLifecycle {
  /** Begin routing CDP events for `tabId`. Returns a `CdpLike` adapter scoped
   * to that tab, ready to hand to a `NetworkCapturer` (or anything else that
   * wants a CDP session). Safe to call again after `stop()`. */
  start(tabId: number): CdpLike;
  /** Stop routing events and clear the active tab. Idempotent. */
  stop(): void;
  /** The tab currently targeted, or `undefined` if stopped/detached. */
  activeTabId(): number | undefined;
}

/**
 * Owns the `chrome.debugger.onEvent` / `onDetach` listeners for the
 * extension's entire lifetime. Construct ONE of these at module top level —
 * never per-recording — so listeners don't leak across start/stop cycles and
 * so an MV3 service-worker restart still has them wired (top-level module
 * code re-runs on every wake, unlike listeners registered inside an async
 * function that only runs while a recording is active).
 *
 * `onEvent` is routed to whichever tab is currently active (set via
 * `start(tabId)`); events from other tabs are ignored, same as before.
 *
 * `onDetach` recovers state when the debugger session is torn down out from
 * under the recording (DevTools opened on the tab, the "this page is being
 * debugged" infobar dismissed, the tab closed, etc.): it clears the active
 * tab so stale events stop routing, and notifies the caller (e.g. to drop
 * its `NetworkCapturer` and push a status update) instead of leaving capture
 * silently dead with stale state.
 */
export function makeDebuggerLifecycle(
  dbg: DebuggerLifecycleDbg,
  onDetach?: (reason: string) => void,
): DebuggerLifecycle {
  let activeTabId: number | undefined;
  let handlers: Record<string, Array<(params: unknown) => void>> = {};

  dbg.onEvent.addListener((source, method, params) => {
    if (activeTabId == null || source.tabId !== activeTabId) return;
    for (const h of handlers[method] ?? []) h(params);
  });

  dbg.onDetach.addListener((source, reason) => {
    if (activeTabId == null || source.tabId !== activeTabId) return;
    activeTabId = undefined;
    handlers = {};
    onDetach?.(reason);
  });

  return {
    start(tabId: number): CdpLike {
      activeTabId = tabId;
      handlers = {};
      return {
        send: (method, params) => dbg.sendCommand({ tabId }, method, params as object | undefined),
        on: (event, handler) => {
          (handlers[event] ??= []).push(handler);
        },
      };
    },
    stop(): void {
      activeTabId = undefined;
      handlers = {};
    },
    activeTabId: () => activeTabId,
  };
}
