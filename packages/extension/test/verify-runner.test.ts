import { describe, expect, test, vi } from "vitest";
import type { ReplayStep } from "@skillwright/shared";
import { verifySkill } from "../src/verify/runner";

const click = (selector: string, effect: ReplayStep["effect"] = "readonly"): ReplayStep => ({
  type: "click",
  effect,
  selectors: [selector],
});

/** A `send` that always succeeds: every Runtime.evaluate resolves the element. */
function okSend() {
  return vi.fn(async (_method: string, params?: any) => {
    if (params?.returnByValue === false) return { result: { objectId: "obj" } };
    // coordsExpression / existsExpression / kind — return a shape that satisfies each.
    return { result: { value: { found: true, x: 1, y: 1, hit: true } } };
  });
}

describe("verifySkill — destructive gating", () => {
  test("skips destructive steps by default and NEVER sends a command for them", async () => {
    const send = okSend();
    const results = await verifySkill([click("aria/Delete", "destructive")], { tabId: 1, send });
    expect(results).toEqual([{ index: 0, outcome: "skipped-destructive" }]);
    expect(send).not.toHaveBeenCalled();
  });

  test("runs destructive steps when confirmDestructive is set", async () => {
    const send = okSend();
    const results = await verifySkill([click("aria/Delete", "destructive")], {
      tabId: 1,
      confirmDestructive: true,
      send,
    });
    expect(results[0]!.outcome).not.toBe("skipped-destructive");
    expect(send).toHaveBeenCalled();
  });

  test("readonly and mutating steps run without confirmation", async () => {
    const send = okSend();
    const results = await verifySkill([click("aria/Open"), click("aria/Save", "mutating")], {
      tabId: 1,
      send,
    });
    expect(results.map((r) => r.outcome)).toEqual(["ok", "ok"]);
  });
});

describe("verifySkill — failure reporting", () => {
  test("a failing step reports its index and selector", async () => {
    const send = vi.fn(async () => ({ result: { value: { found: false } } }));
    const results = await verifySkill([click("aria/Missing")], { tabId: 1, send });
    expect(results[0]!.index).toBe(0);
    expect(results[0]!.outcome).toBe("fail");
    expect(results[0]!.error).toContain("aria/Missing");
  });

  test("a thrown CDP error is caught and reported, never escapes", async () => {
    const send = vi.fn(async () => {
      throw new Error("debugger detached");
    });
    const results = await verifySkill([click("aria/Anything")], { tabId: 1, send });
    expect(results[0]!.outcome).toBe("fail");
    expect(results[0]!.error).toContain("debugger detached");
  });

  test("verification STOPS at the first failure — later steps replay stale state", async () => {
    let call = 0;
    const send = vi.fn(async (_m: string, params?: any) => {
      call++;
      if (call === 1) return { result: { value: { found: false } } }; // step 0 fails
      return { result: { value: { found: true, x: 1, y: 1, hit: true } } };
    });
    const results = await verifySkill([click("aria/A"), click("aria/B")], { tabId: 1, send });
    expect(results).toHaveLength(1);
    expect(results[0]!.outcome).toBe("fail");
  });

  test("a skipped destructive step does not stop the run", async () => {
    const send = okSend();
    const results = await verifySkill([click("aria/Delete", "destructive"), click("aria/Next")], {
      tabId: 1,
      send,
    });
    expect(results.map((r) => r.outcome)).toEqual(["skipped-destructive", "ok"]);
  });
});

describe("verifySkill — totality", () => {
  test("an empty skill verifies to an empty result list, no commands sent", async () => {
    const send = okSend();
    expect(await verifySkill([], { tabId: 1, send })).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });
});
