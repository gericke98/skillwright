import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startFixtureServer, type FixtureServer } from "@skillwright/fixture-app";
import { runSkill, PlaywrightStepDriver, type ReplayStep } from "skillwright";

/**
 * Regression (found dogfooding real checkboxes): a "change" step on a checkbox/
 * radio must be replayed with setChecked, not fill — Playwright throws when you
 * fill a checkbox, so a captured toggle would fail. Capture records the boolean
 * checked state as the step value; the driver drives that state.
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

describe("checkbox replay against real Chromium + fixture", () => {
  test("checks a checkbox via a change step (setChecked, not fill)", async () => {
    const page: Page = await browser.newPage();
    await page.goto(fx.url);
    const box = page.getByLabel("Only overdue");
    expect(await box.isChecked()).toBe(false);

    const steps: ReplayStep[] = [
      { type: "change", effect: "mutating", selectors: ["aria/Only overdue"], value: "true" },
    ];
    const result = await runSkill(steps, new PlaywrightStepDriver(page, 4000), {
      confirmDestructive: true,
    });
    expect(result.status).toBe("ok");
    expect(await box.isChecked()).toBe(true);
    await page.close();
  }, 20000);

  test("unchecks a checked box when the captured state is false", async () => {
    const page: Page = await browser.newPage();
    await page.goto(fx.url);
    const box = page.getByLabel("Only overdue");
    await box.check();
    expect(await box.isChecked()).toBe(true);

    const steps: ReplayStep[] = [
      { type: "change", effect: "mutating", selectors: ["aria/Only overdue"], value: "false" },
    ];
    const result = await runSkill(steps, new PlaywrightStepDriver(page, 4000), {
      confirmDestructive: true,
    });
    expect(result.status).toBe("ok");
    expect(await box.isChecked()).toBe(false);
    await page.close();
  }, 20000);
});
