import { describe, it, expect, vi } from "vitest";
import { makeDebuggerLifecycle } from "../src/debugger-lifecycle";

describe("debugger lifecycle", () => {
  it("registers onEvent once regardless of start/stop cycles", () => {
    const onEvent = { addListener: vi.fn(), removeListener: vi.fn() };
    const life = makeDebuggerLifecycle({ onEvent, onDetach: { addListener: vi.fn() } } as any);
    life.start(1); life.stop(); life.start(1);
    expect(onEvent.addListener).toHaveBeenCalledTimes(1);
  });
  it("clears state on detach", () => {
    let detachCb: any;
    const onDetach = { addListener: (cb: any) => (detachCb = cb) };
    const life = makeDebuggerLifecycle({ onEvent: { addListener: vi.fn() }, onDetach } as any);
    life.start(1);
    detachCb({ tabId: 1 }, "canceled_by_user");
    expect(life.activeTabId()).toBeUndefined();
  });
});
