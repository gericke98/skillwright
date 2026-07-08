import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startFixtureServer, type FixtureServer } from "@skillwright/fixture-app";
import { runSkill, PlaywrightStepDriver, type ReplayStep } from "skillwright";

/**
 * keydown replay: typing a query then pressing Enter to submit — the most common
 * day-to-day action. Previously the capture only had click/change listeners, so
 * the Enter (and thus the submit) was lost. Now a keydown step presses the key.
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

describe("keydown replay against real Chromium + fixture", () => {
  test("types into search and presses Enter to submit", async () => {
    const page: Page = await browser.newPage();
    await page.goto(fx.url);
    const steps: ReplayStep[] = [
      { type: "change", effect: "mutating", selectors: ["aria/Search invoices"], value: "INV-001" },
      { type: "keydown", effect: "mutating", selectors: ["aria/Search invoices"], key: "Enter" },
    ];
    const driver = new PlaywrightStepDriver(page, 4000);
    const result = await runSkill(steps, driver, { confirmDestructive: true });
    expect(result.status).toBe("ok");
    expect(await page.locator("#result").textContent()).toBe("Searched INV-001");
    await page.close();
  }, 20000);
});
