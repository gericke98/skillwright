import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startFixtureServer, type FixtureServer } from "@skillwright/fixture-app";
import { runSkill, PlaywrightStepDriver, type ReplayStep } from "skillwright";

/**
 * iframe replay end-to-end: the fixture embeds a same-origin iframe with a
 * button. A step targeting that button must resolve THROUGH the frame boundary
 * (the driver searches child frames), click it, and see the frame's own DOM update.
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

describe("iframe replay against real Chromium + fixture", () => {
  test("clicks a button inside a same-origin iframe (driver pierces frames)", async () => {
    const page: Page = await browser.newPage();
    await page.goto(fx.url);
    const frame = page.frameLocator('iframe[title="Embedded panel"]');
    await frame.getByLabel("Frame action").waitFor();

    const steps: ReplayStep[] = [
      { type: "click", effect: "mutating", selectors: ["aria/Frame action", '[data-testid="frame-btn"]'] },
    ];
    const driver = new PlaywrightStepDriver(page, 4000);
    const result = await runSkill(steps, driver, { confirmDestructive: true });

    expect(result.status).toBe("ok");
    expect(await frame.locator("#frame-result").textContent()).toBe("frame clicked");
    await page.close();
  }, 20000);
});
