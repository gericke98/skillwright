import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startFixtureServer, type FixtureServer } from "@skillwright/fixture-app";
import { runSkill, PlaywrightStepDriver, type ReplayStep } from "skillwright";

/**
 * API-replay end-to-end against real Chromium: a step is replayed AS its captured
 * request (a DELETE) via the authenticated context's request API — the backend
 * receives the DELETE without any DOM interaction. Proves faster, deterministic
 * replay immune to UI churn, still routed through the safety gate.
 */
let fx: FixtureServer;
let browser: Browser;

beforeAll(async () => {
  fx = await startFixtureServer(0);
  browser = await chromium.launch({ headless: true });
}, 30000);
afterAll(async () => {
  await browser?.close();
  await fx?.close();
});

describe("API-replay against real Chromium + fixture", () => {
  test("replays a DELETE as its captured request; the backend receives it, DOM untouched", async () => {
    const context = await browser.newContext();
    const page: Page = await context.newPage();
    await page.goto(fx.url);
    const before = fx.apiCalls.length;

    // A step whose selectors are deliberately BOGUS — only API-replay can complete it.
    const steps: ReplayStep[] = [
      {
        type: "click",
        effect: "destructive",
        selectors: ["aria/does-not-exist"],
        request: { method: "DELETE", url: `${fx.url}api/invoices/INV-001` },
      },
    ];
    const driver = new PlaywrightStepDriver(page, 3000);

    const result = await runSkill(steps, driver, { confirmDestructive: true, apiReplay: true });

    expect(result.status).toBe("ok");
    const newCalls = fx.apiCalls.slice(before);
    expect(newCalls).toContainEqual({ method: "DELETE", path: "/api/invoices/INV-001" });

    await context.close();
  }, 20000);
});
