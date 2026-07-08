import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startFixtureServer, type FixtureServer } from "@skillwright/fixture-app";
import { runSkill, PlaywrightStepDriver, type ReplayStep } from "skillwright";

/**
 * Regression (found dogfooding file upload): a file input can't be fill()-ed
 * (throws) and its captured path is a useless browser fakepath. Capture emits a
 * required {file} runtime input; replay uses setInputFiles with the path the
 * caller passes via --input file=<path>.
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

describe("file-upload replay against real Chromium + fixture", () => {
  test("attaches a file via setInputFiles (not fill)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skw-upload-"));
    const filePath = join(dir, "receipt.txt");
    writeFileSync(filePath, "dummy receipt");

    const page: Page = await browser.newPage();
    await page.goto(fx.url);
    const field = page.getByLabel("Attach receipt");
    expect(await field.evaluate((el) => el.files?.length ?? 0)).toBe(0);

    // The {file} placeholder has already been resolved to a real path (as
    // applyInputs would do from --input file=<path>).
    const steps: ReplayStep[] = [
      { type: "change", effect: "mutating", selectors: ["aria/Attach receipt"], value: filePath },
    ];
    const result = await runSkill(steps, new PlaywrightStepDriver(page, 4000), {
      confirmDestructive: true,
    });
    expect(result.status).toBe("ok");
    expect(await field.evaluate((el) => el.files?.[0]?.name)).toBe("receipt.txt");
    await page.close();
  }, 20000);
});
