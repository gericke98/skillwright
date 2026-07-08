import { describe, expect, test, vi } from "vitest";
import { runSkill, type ReplayStep, type StepDriver, type PageSnapshot } from "../src/replay";

/**
 * A driver where each (selector) maps to an outcome. Missing selector → "fail".
 * snapshot() returns a canned page view. Records what it executed.
 */
function fakeDriver(outcomes: Record<string, "ok" | "fail" | "partial">): StepDriver & {
  executed: string[];
} {
  const executed: string[] = [];
  return {
    executed,
    async execute(_step, selector) {
      executed.push(selector);
      return outcomes[selector] ?? "fail";
    },
    async snapshot(): Promise<PageSnapshot> {
      return { url: "https://erp.test/invoices", aria: "<aria snapshot>" };
    },
  };
}

const step = (effect: ReplayStep["effect"], selectors: string[]): ReplayStep => ({
  type: "click",
  effect,
  selectors,
});

describe("runSkill — tier-3 heal (§6.2)", () => {
  test("a readonly step with an exhausted stack heals and the run completes", async () => {
    const driver = fakeDriver({ "healed-sel": "ok" }); // original selectors all fail
    const heal = vi.fn(async () => "healed-sel");
    const onHeal = vi.fn();
    const result = await runSkill([step("readonly", ["stale-a", "stale-b"])], driver, {
      confirmDestructive: false,
      heal,
      onHeal,
    });
    expect(result.status).toBe("ok");
    expect(heal).toHaveBeenCalledOnce();
    expect(onHeal).toHaveBeenCalledWith({ stepIndex: 0, selector: "healed-sel" });
    expect(driver.executed).toContain("healed-sel");
  });

  test("a mutating step that cleanly missed (never fired) heals", async () => {
    const driver = fakeDriver({ "new-sel": "ok" });
    const result = await runSkill([step("mutating", ["stale"])], driver, {
      confirmDestructive: false,
      heal: async () => "new-sel",
    });
    expect(result.status).toBe("ok");
  });

  test("a destructive step never heals without confirmation", async () => {
    const driver = fakeDriver({ "new-sel": "ok" });
    const heal = vi.fn(async () => "new-sel");
    const result = await runSkill([step("destructive", ["stale"])], driver, {
      confirmDestructive: false,
      heal,
    });
    expect(result.status).toBe("needs-confirmation");
    expect(heal).not.toHaveBeenCalled();
  });

  test("a destructive step heals when confirmation is given", async () => {
    const driver = fakeDriver({ "new-sel": "ok" });
    const result = await runSkill([step("destructive", ["stale"])], driver, {
      confirmDestructive: true,
      heal: async () => "new-sel",
    });
    expect(result.status).toBe("ok");
  });

  test("a partially-executed mutating step HALTS instead of healing (double-send guard)", async () => {
    // The primary selector fired but its postcondition failed → "partial".
    const driver = fakeDriver({ "primary": "partial", "new-sel": "ok" });
    const heal = vi.fn(async () => "new-sel");
    const result = await runSkill([step("mutating", ["primary", "backup"])], driver, {
      confirmDestructive: true,
      heal,
    });
    expect(result.status).toBe("failed");
    expect(heal).not.toHaveBeenCalled();
    // must NOT try further selectors after a partial fire
    expect(driver.executed).toEqual(["primary"]);
  });

  test("a heal that finds no selector emits the failure report", async () => {
    const driver = fakeDriver({});
    const result = await runSkill([step("readonly", ["stale"])], driver, {
      confirmDestructive: false,
      heal: async () => null,
    });
    expect(result.status).toBe("failed");
  });

  test("with no heal configured, an exhausted stack still just reports failure", async () => {
    const driver = fakeDriver({});
    const result = await runSkill([step("readonly", ["stale"])], driver, {
      confirmDestructive: false,
    });
    expect(result.status).toBe("failed");
  });
});
