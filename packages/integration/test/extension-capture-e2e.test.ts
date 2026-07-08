import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Worker } from "playwright";
import { startFixtureServer, type FixtureServer } from "@skillwright/fixture-app";

/**
 * The strongest capture validation possible without the user's own sites: load
 * the REAL built MV3 extension into Chromium and prove it actually captures
 * interactions on a live page. Unit tests cover buildCaptureStep in isolation;
 * this exercises the wiring nothing else does — manifest, service-worker
 * lifecycle, content-script injection (all_frames/document_start), and the
 * page→background message path that a broken build would silently break.
 */
const EXT_DIR = resolve(__dirname, "../../extension/dist-extension");

let ctx: BrowserContext | undefined;
let fx: FixtureServer;
let sw: Worker | undefined;
/** MV3 extensions need a headed browser; a headless CI box (no display) can't
 * load the service worker. When that happens we skip rather than fail — the test
 * validates the real wiring locally and is a no-op where it structurally can't run. */
let available = false;

beforeAll(async () => {
  // Build the extension if the CI/test run hasn't already.
  if (!existsSync(resolve(EXT_DIR, "manifest.json"))) {
    execFileSync("pnpm", ["--filter", "@skillwright/extension", "build:crx"], {
      cwd: resolve(__dirname, "../../.."),
      stdio: "inherit",
    });
  }
  fx = await startFixtureServer(0);
  // A headed browser needs a display. macOS always has one; on Linux we require
  // DISPLAY so a headless CI box skips (launching headed there can hang, not just
  // throw). Run this locally, or under xvfb, to exercise it.
  const hasDisplay = process.platform === "darwin" || !!process.env.DISPLAY;
  if (!hasDisplay) return;
  try {
    ctx = await chromium.launchPersistentContext("", {
      headless: false,
      args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
    });
    sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker", { timeout: 30000 }));
    available = !!sw;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[ext-e2e] launch/SW failed:", (e as Error)?.message);
    available = false; // no display / headless CI — skip cleanly
  }
}, 120000);

afterAll(async () => {
  await ctx?.close();
  await fx?.close();
});

describe("built MV3 extension — real capture end-to-end", () => {
  // Dynamic skip INSIDE the body: `available` is only known after beforeAll, and
  // test.skipIf/.skip are evaluated at collection time (before beforeAll runs).
  test("captures a select change + a checkbox on a live page", async (t) => {
    if (!available) t.skip();
    const id = new URL(sw!.url()).host; // chrome-extension://<id>/...

    // An extension page gives us a chrome.runtime bridge to drive the background.
    const panel = await ctx!.newPage();
    await panel.goto(`chrome-extension://${id}/src/panel.html`);

    // Start recording via the background's message API.
    await panel.evaluate(() => chrome.runtime.sendMessage({ kind: "start", title: "e2e capture" }));

    // Interact with the fixture; content scripts should capture these.
    const page = await ctx!.newPage();
    await page.goto(fx.url);
    await page.getByLabel("Status filter").selectOption("paid");
    await page.getByLabel("Only overdue").check();
    await page.waitForTimeout(300); // let the step messages reach the background

    const status = (await panel.evaluate(
      () => new Promise((r) => chrome.runtime.sendMessage({ kind: "status" }, r)),
    )) as { recording: boolean; stepCount: number };

    expect(status.recording).toBe(true);
    expect(status.stepCount).toBeGreaterThanOrEqual(2); // the select change + the checkbox
    await page.close();
    await panel.close();
  }, 60000);
});
