import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { chromium, type Browser, type Page } from "playwright";
import { startFixtureServer, type FixtureServer } from "@bskill/fixture-app";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  WsRelayServer,
  RelayStepDriver,
  runSkill,
  runSkillViaRelay,
  distill,
  writeSkillDirectory,
  translateSelector,
  type ReplayStep,
} from "bskill";
import type { Recording } from "@bskill/shared";

/**
 * End-to-end relay path (design B): RelayStepDriver → WsRelayServer (real
 * WebSocket) → a FAKE extension that performs each command on the fixture via
 * Playwright → real DOM. This proves the whole relay pipeline — pairing,
 * protocol, routing, driver, safety gate — with only the extension's
 * chrome.debugger execution swapped for Playwright. The real extension replaces
 * exactly that one function live.
 */
const TOKEN = "test-pair-token";

/** Stand-in for the real extension: pairs, then performs commands on `page`. */
function fakeExtension(url: string, token: string, page: Page): Promise<WebSocket> {
  const ws = new WebSocket(url);
  const locator = (selector: string) => {
    const d = translateSelector(selector);
    if (d.kind === "label") return page.getByLabel(d.value);
    if (d.kind === "text") return page.getByText(d.value, { exact: true });
    return page.locator(d.value);
  };
  ws.on("message", async (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.kind !== "perform") return;
    try {
      const loc = locator(msg.selector).first();
      if (msg.action === "change") await loc.fill(msg.value ?? "", { timeout: 2000 });
      else if (msg.action === "click") await loc.click({ timeout: 2000 });
      ws.send(JSON.stringify({ kind: "result", id: msg.id, ok: true }));
    } catch (e) {
      ws.send(JSON.stringify({ kind: "result", id: msg.id, ok: false, error: (e as Error).message }));
    }
  });
  return new Promise((resolve, reject) => {
    ws.on("open", () => ws.send(JSON.stringify({ kind: "pair", token })));
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.kind === "paired") (msg.ok ? resolve(ws) : reject(new Error(msg.error)));
    });
    ws.on("error", reject);
  });
}

const deleteFlow: ReplayStep[] = [
  { type: "change", effect: "mutating", selectors: ["aria/Search invoices"], value: "INV-001" },
  { type: "click", effect: "destructive", selectors: ["aria/Delete invoice INV-001", '[data-testid="delete-invoice"]'] },
];

let fx: FixtureServer;
let browser: Browser;

beforeAll(async () => {
  fx = await startFixtureServer(0);
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await fx?.close();
});

describe("relay e2e: driver → WS server → fake extension → real DOM", () => {
  test("a paired extension replays the delete flow and removes the row (with confirmation)", async () => {
    const page = await browser.newPage();
    await page.goto(fx.url);
    const relay = new WsRelayServer({ token: TOKEN });
    const { url } = await relay.start();
    const ext = await fakeExtension(url, TOKEN, page);
    await relay.waitForExtension();

    const result = await runSkill(deleteFlow, new RelayStepDriver(relay.transport), {
      confirmDestructive: true,
    });

    expect(result.status).toBe("ok");
    expect(await page.locator('[data-invoice="INV-001"]').count()).toBe(0);
    expect(await page.locator("#result").textContent()).toBe("Deleted INV-001");

    ext.close();
    await relay.close();
    await page.close();
  });

  test("the safety gate still blocks the destructive step over the relay (no confirmation)", async () => {
    const page = await browser.newPage();
    await page.goto(fx.url);
    const relay = new WsRelayServer({ token: TOKEN });
    const { url } = await relay.start();
    const ext = await fakeExtension(url, TOKEN, page);
    await relay.waitForExtension();

    const result = await runSkill(deleteFlow, new RelayStepDriver(relay.transport), {
      confirmDestructive: false,
    });

    expect(result.status).toBe("needs-confirmation");
    expect(await page.locator('[data-invoice="INV-001"]').count()).toBe(1);

    ext.close();
    await relay.close();
    await page.close();
  });

  test("an extension presenting the wrong token is rejected (pairing fails)", async () => {
    const page = await browser.newPage();
    await page.goto(fx.url);
    const relay = new WsRelayServer({ token: TOKEN });
    const { url } = await relay.start();
    await expect(fakeExtension(url, "WRONG-TOKEN", page)).rejects.toThrow(/invalid token/i);
    await relay.close();
    await page.close();
  });

  test("runSkillViaRelay loads a distilled skill from disk and replays it via the relay", async () => {
    const page = await browser.newPage();
    await page.goto(fx.url);

    const recording: Recording = {
      title: "Delete invoice INV-001",
      steps: [
        { type: "change", effect: "mutating", selectors: [["aria/Search invoices"]], value: "INV-001" },
        { type: "click", effect: "destructive", selectors: [["aria/Delete invoice INV-001"], ['[data-testid="delete-invoice"]']] },
      ],
      "x-bskill": { version: 1, segment: { id: "s", parentSkill: null, recordedAt: "2026-07-07T00:00:00.000Z" } },
    };
    const home = mkdtempSync(join(tmpdir(), "bskill-relay-"));
    const skill = distill(recording, {});
    writeSkillDirectory(skill, home);

    const result = await runSkillViaRelay(skill.slug, {
      confirmDestructive: true,
      port: 0,
      libraryDir: home,
      onReady: ({ url, token }) => {
        // The extension connects once the relay is up (fire and forget).
        void fakeExtension(url, token, page);
      },
    });

    expect(result.status).toBe("ok");
    expect(await page.locator('[data-invoice="INV-001"]').count()).toBe(0);
    await page.close();
  });
});
