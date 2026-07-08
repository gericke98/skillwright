import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startFixtureServer, type FixtureServer } from "@skillwright/fixture-app";
import {
  NetworkCapturer,
  correlateRequests,
  deriveNetworkEffect,
  type CdpLike,
  type Step,
} from "@skillwright/shared";

/**
 * Capture v2 end-to-end against real Chromium: a passive CDP Network observer
 * captures the actual HTTP calls a task fires, and the DELETE the "delete" action
 * triggers is correlated back to that step to prove a `destructive` effect from
 * NETWORK TRUTH — not from a label or an LLM. This is the capture half of the
 * network-truth pipeline (slice 1 was the effect fusion).
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

describe("network capture against real Chromium + fixture", () => {
  test("captures the DELETE the delete action fires, and derives a destructive effect", async () => {
    const context = await browser.newContext();
    const page: Page = await context.newPage();

    // Attach the passive observer BEFORE navigating so we see every request.
    const cdp = await context.newCDPSession(page);
    const capturer = new NetworkCapturer();
    await capturer.attach(cdp as unknown as CdpLike);

    await page.goto(fx.url);

    // The moment the delete step happens (for correlation) and the action itself.
    const stepTimestamp = Date.now();
    await Promise.all([
      page.waitForRequest((r) => r.method() === "DELETE"),
      page.getByLabel("Delete invoice INV-001").click(),
    ]);

    const captured = capturer.collected();
    const del = captured.find((r) => r.method === "DELETE");
    expect(del).toBeDefined();
    expect(del!.url).toContain("/api/invoices/INV-001");

    // Correlate the captured traffic back to the delete step → network effect.
    const steps: Step[] = [{ type: "click", timestamp: stepTimestamp }];
    const correlated = correlateRequests(steps, captured, 5000);
    expect(deriveNetworkEffect(correlated[0]!.requests ?? [])).toBe("destructive");

    await context.close();
  }, 20000);
});
