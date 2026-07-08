import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startFixtureServer, type FixtureServer } from "@bskill/fixture-app";
import { runSkill, PlaywrightStepDriver, type ReplayStep, type HealFn } from "@bskill/cli";

/**
 * Tier-3 heal end-to-end against real Chromium + the fixture app. The delete
 * step's entire selector stack is broken; the healer (a fake here — the LLM
 * healer is unit-tested) reads the real page snapshot and returns a working
 * selector, which the real driver then executes. Proves snapshot() + heal +
 * real DOM mutation, and that the safety gate still blocks an unconfirmed
 * destructive heal.
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

async function freshPage(): Promise<Page> {
  const page = await browser.newPage();
  await page.goto(fx.url);
  return page;
}

/** The delete step's whole stack is stale — only a heal can recover it. */
function brokenDeleteFlow(): ReplayStep[] {
  return [
    { type: "change", effect: "mutating", selectors: ["aria/Search invoices"], value: "INV-001" },
    { type: "click", effect: "destructive", selectors: ["aria/GONE-delete-button"] },
  ];
}

describe("tier-3 heal against real Chromium + fixture app", () => {
  test("a fully-broken destructive selector heals (with confirmation) and deletes the row", async () => {
    const p = await freshPage();
    expect(await p.locator('[data-invoice="INV-001"]').count()).toBe(1);

    const heal: HealFn = async (_step, snapshot) => {
      // the healer sees the real page; the delete control is present under its
      // stable ARIA name even though the recorded selector is gone
      expect(snapshot.aria).toContain("Delete invoice INV-001");
      return "aria/Delete invoice INV-001";
    };
    const onHeal = vi.fn();
    const driver = new PlaywrightStepDriver(p, 3000);

    const result = await runSkill(brokenDeleteFlow(), driver, {
      confirmDestructive: true,
      heal,
      onHeal,
    });

    expect(result.status).toBe("ok");
    expect(await p.locator('[data-invoice="INV-001"]').count()).toBe(0); // healed click deleted it
    expect(onHeal).toHaveBeenCalledWith({ stepIndex: 1, selector: "aria/Delete invoice INV-001" });
  }, 20000);

  test("without confirmation, the destructive step never heals — the row survives", async () => {
    const p = await freshPage();
    const heal = vi.fn(async () => "aria/Delete invoice INV-001");
    const driver = new PlaywrightStepDriver(p, 3000);

    const result = await runSkill(brokenDeleteFlow(), driver, {
      confirmDestructive: false,
      heal,
    });

    expect(result.status).toBe("needs-confirmation");
    expect(heal).not.toHaveBeenCalled();
    expect(await p.locator('[data-invoice="INV-001"]').count()).toBe(1); // untouched
  }, 20000);
});
