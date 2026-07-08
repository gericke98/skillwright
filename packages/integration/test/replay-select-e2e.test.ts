import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startFixtureServer, type FixtureServer } from "@skillwright/fixture-app";
import { runSkill, PlaywrightStepDriver, type ReplayStep } from "skillwright";

/**
 * Regression (found dogfooding a real dropdown): a "change" step on a <select>
 * must be replayed with selectOption, not fill (which throws on a <select>).
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

describe("select replay against real Chromium + fixture", () => {
  test("selects an option in a <select> (selectOption, not fill)", async () => {
    const page: Page = await browser.newPage();
    await page.goto(fx.url);
    const steps: ReplayStep[] = [
      { type: "change", effect: "mutating", selectors: ["aria/Status filter"], value: "paid" },
    ];
    const driver = new PlaywrightStepDriver(page, 4000);
    const result = await runSkill(steps, driver, { confirmDestructive: true });
    expect(result.status).toBe("ok");
    expect(await page.getByLabel("Status filter").inputValue()).toBe("paid");
    await page.close();
  }, 20000);
});
