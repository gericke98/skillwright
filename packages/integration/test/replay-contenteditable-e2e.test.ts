import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startFixtureServer, type FixtureServer } from "@skillwright/fixture-app";
import { runSkill, PlaywrightStepDriver, type ReplayStep } from "skillwright";

/**
 * Regression (found dogfooding rich-text editors): typing into a contenteditable
 * (Gmail/Slack/Notion-style editor) must round-trip. It fires `input` not
 * `change` and has no form `value`, so capture records its text as a `change`
 * step value and replay uses fill() (which supports contenteditable).
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

describe("contenteditable replay against real Chromium + fixture", () => {
  test("sets the text of a contenteditable editor via a change step", async () => {
    const page: Page = await browser.newPage();
    await page.goto(fx.url);
    const note = page.getByLabel("Invoice note");
    expect((await note.textContent())?.trim()).toBe("");

    const steps: ReplayStep[] = [
      {
        type: "change",
        effect: "mutating",
        selectors: ["aria/Invoice note"],
        value: "Chase payment by Friday",
      },
    ];
    const result = await runSkill(steps, new PlaywrightStepDriver(page, 4000), {
      confirmDestructive: true,
    });
    expect(result.status).toBe("ok");
    expect((await note.textContent())?.trim()).toBe("Chase payment by Friday");
    await page.close();
  }, 20000);
});
