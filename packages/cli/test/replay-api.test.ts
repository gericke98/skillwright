import { describe, expect, test, vi } from "vitest";
import { runSkill, type ReplayStep, type StepDriver } from "../src/replay";

/** Driver that records DOM executes and API replays; both are configurable. */
function driver(opts: {
  domOutcome?: "ok" | "fail" | "partial";
  apiOutcome?: "ok" | "fail" | "partial";
}): StepDriver & { domCalls: string[]; apiCalls: unknown[] } {
  const domCalls: string[] = [];
  const apiCalls: unknown[] = [];
  return {
    domCalls,
    apiCalls,
    async execute(_step, selector) {
      domCalls.push(selector);
      return opts.domOutcome ?? "ok";
    },
    async executeRequest(request) {
      apiCalls.push(request);
      return opts.apiOutcome ?? "ok";
    },
  };
}

const step = (effect: ReplayStep["effect"], withRequest = true): ReplayStep => ({
  type: "click",
  effect,
  selectors: ["aria/Delete"],
  ...(withRequest ? { request: { method: "DELETE", url: "https://api.test/invoices/INV-1" } } : {}),
});

describe("runSkill — API-replay mode (§ Capture v2)", () => {
  test("replays a step via its captured request; the DOM is not touched", async () => {
    const d = driver({ apiOutcome: "ok" });
    const result = await runSkill([step("mutating")], d, { confirmDestructive: true, apiReplay: true });
    expect(result.status).toBe("ok");
    expect(d.apiCalls).toHaveLength(1);
    expect(d.domCalls).toHaveLength(0); // deterministic API path, no DOM
  });

  test("a readonly API-replay that fails falls back to the DOM", async () => {
    const d = driver({ apiOutcome: "fail", domOutcome: "ok" });
    const result = await runSkill([step("readonly")], d, { confirmDestructive: false, apiReplay: true });
    expect(result.status).toBe("ok");
    expect(d.apiCalls).toHaveLength(1);
    expect(d.domCalls.length).toBeGreaterThan(0); // fell back
  });

  test("a MUTATING API-replay that fails does NOT fall back (double-execute guard)", async () => {
    const d = driver({ apiOutcome: "fail", domOutcome: "ok" });
    const result = await runSkill([step("mutating")], d, { confirmDestructive: true, apiReplay: true });
    expect(result.status).toBe("failed");
    expect(d.domCalls).toHaveLength(0); // never fell back to the DOM
  });

  test("a destructive step still needs confirmation before API-replay", async () => {
    const d = driver({ apiOutcome: "ok" });
    const result = await runSkill([step("destructive")], d, { confirmDestructive: false, apiReplay: true });
    expect(result.status).toBe("needs-confirmation");
    expect(d.apiCalls).toHaveLength(0); // the request was never fired
  });

  test("a step without a captured request uses the DOM path", async () => {
    const d = driver({ apiOutcome: "ok", domOutcome: "ok" });
    const result = await runSkill([step("mutating", false)], d, { confirmDestructive: true, apiReplay: true });
    expect(result.status).toBe("ok");
    expect(d.apiCalls).toHaveLength(0);
    expect(d.domCalls.length).toBeGreaterThan(0);
  });

  test("without apiReplay, the request is ignored and the DOM path runs (regression)", async () => {
    const d = driver({ apiOutcome: "ok", domOutcome: "ok" });
    const result = await runSkill([step("mutating")], d, { confirmDestructive: true });
    expect(result.status).toBe("ok");
    expect(d.apiCalls).toHaveLength(0);
    expect(d.domCalls.length).toBeGreaterThan(0);
  });
});
