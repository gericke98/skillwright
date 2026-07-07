import { describe, expect, test } from "vitest";
import type { EffectTag } from "@bskill/shared";
import { runSkill, type ReplayStep, type StepDriver } from "../src/index";

function step(effect: EffectTag, selectors: string[]): ReplayStep {
  return { type: "click", effect, selectors };
}

/** A driver whose success is decided by a set of "working" selectors. */
function fakeDriver(working: Set<string>): StepDriver & { attempts: string[] } {
  const attempts: string[] = [];
  return {
    attempts,
    async execute(_step, selector) {
      attempts.push(selector);
      return working.has(selector) ? "ok" : "fail";
    },
  };
}

describe("runSkill — deterministic replay orchestration", () => {
  test("runs every step to completion when the primary selector works", async () => {
    const driver = fakeDriver(new Set(["aria/A", "aria/B"]));
    const result = await runSkill(
      [step("readonly", ["aria/A"]), step("mutating", ["aria/B"])],
      driver,
      { confirmDestructive: false },
    );
    expect(result.status).toBe("ok");
    expect(driver.attempts).toEqual(["aria/A", "aria/B"]);
  });

  test("falls down the selector stack when the primary fails", async () => {
    const driver = fakeDriver(new Set(["#backup"]));
    const result = await runSkill([step("mutating", ["aria/Gone", "#backup"])], driver, {
      confirmDestructive: false,
    });
    expect(result.status).toBe("ok");
    expect(driver.attempts).toEqual(["aria/Gone", "#backup"]);
  });

  test("halts on a destructive step without confirmation and reports it", async () => {
    const driver = fakeDriver(new Set(["aria/Delete"]));
    const result = await runSkill([step("destructive", ["aria/Delete"])], driver, {
      confirmDestructive: false,
    });
    expect(result.status).toBe("needs-confirmation");
    if (result.status === "needs-confirmation") {
      expect(result.report.stepIndex).toBe(0);
    }
    // Never even attempted the click.
    expect(driver.attempts).toEqual([]);
  });

  test("executes a destructive step when confirmation is given", async () => {
    const driver = fakeDriver(new Set(["aria/Delete"]));
    const result = await runSkill([step("destructive", ["aria/Delete"])], driver, {
      confirmDestructive: true,
    });
    expect(result.status).toBe("ok");
    expect(driver.attempts).toEqual(["aria/Delete"]);
  });

  test("executes a selectorless step (navigate) exactly once", async () => {
    const seen: Array<{ type: string; sel: string }> = [];
    const driver: StepDriver = {
      async execute(s, sel) {
        seen.push({ type: s.type, sel });
        return "ok";
      },
    };
    const nav: ReplayStep = { type: "navigate", effect: "readonly", selectors: [] };
    const result = await runSkill([nav], driver, { confirmDestructive: false });
    expect(result.status).toBe("ok");
    expect(seen).toEqual([{ type: "navigate", sel: "" }]);
  });

  test("emits a structured failure report when all selectors are exhausted", async () => {
    const driver = fakeDriver(new Set());
    const result = await runSkill([step("mutating", ["aria/X", "#y", "text/Z"])], driver, {
      confirmDestructive: false,
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.report.stepIndex).toBe(0);
      expect(result.report.selectorsTried).toEqual(["aria/X", "#y", "text/Z"]);
    }
  });
});
