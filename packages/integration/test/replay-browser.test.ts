import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startFixtureServer, type FixtureServer } from "@skillwright/fixture-app";
import { runSkill, PlaywrightStepDriver, type ReplayStep } from "skillwright";

/**
 * The M1 replay path against a REAL browser engine (Playwright Chromium) + the
 * real fixture app. Verifies selector translation, step execution over the
 * selector stack, and the safety gate — everything except the CDP relay (which
 * needs the user's default profile). Only the transport differs live.
 */
const deleteFlow: ReplayStep[] = [
  {
    type: "change",
    effect: "mutating",
    selectors: ["aria/Search invoices", '[data-testid="search"]'],
    value: "INV-001",
  },
  {
    type: "click",
    effect: "destructive",
    selectors: ["aria/Delete invoice INV-001", '[data-testid="delete-invoice"]', "text/Delete"],
  },
];

let fx: FixtureServer;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  fx = await startFixtureServer(0);
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await fx?.close();
});

async function freshPage(): Promise<Page> {
  page = await browser.newPage();
  await page.goto(fx.url);
  return page;
}

describe("replay against real Chromium + fixture app", () => {
  test("with confirmation, the delete flow actually removes the invoice row", async () => {
    const p = await freshPage();
    expect(await p.locator('[data-invoice="INV-001"]').count()).toBe(1);

    const driver = new PlaywrightStepDriver(p, 3000);
    const result = await runSkill(deleteFlow, driver, { confirmDestructive: true });

    expect(result.status).toBe("ok");
    // Real DOM mutation: the row is gone and the page reported the delete.
    expect(await p.locator('[data-invoice="INV-001"]').count()).toBe(0);
    expect(await p.locator("#result").textContent()).toBe("Deleted INV-001");
    await p.close();
  });

  test("without confirmation, the safety gate blocks the delete — row survives", async () => {
    const p = await freshPage();
    const driver = new PlaywrightStepDriver(p, 3000);
    const result = await runSkill(deleteFlow, driver, { confirmDestructive: false });

    expect(result.status).toBe("needs-confirmation");
    // The destructive click never happened: the row is still there.
    expect(await p.locator('[data-invoice="INV-001"]').count()).toBe(1);
    await p.close();
  });

  test("falls to the test-attr selector when the ARIA anchor is wrong (stack works live)", async () => {
    const p = await freshPage();
    const driver = new PlaywrightStepDriver(p, 2000);
    const brokenPrimary: ReplayStep[] = [
      {
        type: "click",
        effect: "destructive",
        selectors: ["aria/NONEXISTENT LABEL", '[data-testid="delete-invoice"]'],
      },
    ];
    const result = await runSkill(brokenPrimary, driver, { confirmDestructive: true });
    expect(result.status).toBe("ok");
    expect(await p.locator('[data-invoice="INV-001"]').count()).toBe(0);
    await p.close();
  });
});
