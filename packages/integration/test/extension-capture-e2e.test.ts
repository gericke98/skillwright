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

/**
 * Canned provider responses, dispatched by the "TASK:" marker each pass puts in
 * its prompt. Playwright intercepts the real api.anthropic.com request from the
 * extension's own origin, so the panel runs its REAL backend, REAL distiller and
 * REAL parameterizer — only the model is faked. No production code is test-aware.
 */
function cannedLlmResponse(prompt: string, stepCount: number): unknown {
  if (prompt.includes("TASK: infer intent")) {
    return { title: "Sign in to Acme Billing", description: "Signs in to the Acme billing app." };
  }
  if (prompt.includes("TASK: extract parameters")) {
    // The proposer names the username but MISSES the password — the secret
    // floor must add it back, hardened, without any help from the model.
    return { params: [{ name: "username", type: "string", required: true, demoValue: "demo-user" }] };
  }
  if (prompt.includes("TASK: critique parameters")) {
    return { removals: [], additions: [], typeFixes: [] };
  }
  if (prompt.includes("TASK: classify effects")) {
    return { effects: Array.from({ length: stepCount }, () => "readonly") };
  }
  if (prompt.includes("TASK: narrate steps")) {
    return { steps: Array.from({ length: stepCount }, (_, i) => ({ description: `Step ${i + 1}` })) };
  }
  return {};
}

describe("built MV3 extension — full in-extension pipeline", () => {
  test("record → distill → parameterize → approve → export writes a skill with skillwright-inputs", async (t) => {
    if (!available) t.skip();
    const id = new URL(sw!.url()).host;

    const panel = await ctx!.newPage();

    // Capture what the REAL export writer emits: stub only the browser's own
    // directory picker (a platform API, not our code) with a recording handle.
    await panel.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      const written: Record<string, string> = {};
      w.__written = written;
      const makeDir = (base: string): unknown => ({
        getDirectoryHandle: async (name: string) => makeDir(`${base}${name}/`),
        getFileHandle: async (name: string) => ({
          createWritable: async () => ({
            write: async (data: string) => {
              written[`${base}${name}`] = data;
            },
            close: async () => {},
          }),
        }),
      });
      w.showDirectoryPicker = async () => makeDir("");
    });

    // The panel's distill/parameterize passes call the provider; serve canned
    // JSON so the run is deterministic and offline.
    let stepCountForLlm = 0;
    await panel.route("https://api.anthropic.com/**", async (route) => {
      const body = route.request().postDataJSON() as { messages: { content: string }[] };
      const prompt = body.messages[0]!.content;
      const payload = cannedLlmResponse(prompt, stepCountForLlm);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ content: [{ type: "text", text: JSON.stringify(payload) }] }),
      });
    });

    await panel.goto(`chrome-extension://${id}/src/panel.html`);

    // BYO-key settings: the panel needs a configured backend to parameterize.
    await panel.evaluate(() =>
      chrome.storage.local.set({
        llmSettings: { provider: "anthropic", apiKey: "sk-test-key", model: "claude-test" },
      }),
    );

    await panel.evaluate(() => chrome.runtime.sendMessage({ kind: "start", title: "sign in" }));

    // Type a username AND a password on the real fixture form.
    const page = await ctx!.newPage();
    await page.goto(fx.url);
    await page.getByLabel("Username").fill("demo-user");
    // Blur each field: `fill` only dispatches `input`; a text field's `change`
    // event (what capture listens for) fires natively on blur.
    await page.getByLabel("Username").blur();
    await page.getByLabel("Password").fill("hunter2-super-secret");
    await page.getByLabel("Password").blur();
    await page.waitForTimeout(300);
    stepCountForLlm = 2;

    await panel.evaluate(() => chrome.runtime.sendMessage({ kind: "stop" }));

    // The panel now runs distill → parameterize on its own; approval is the
    // one human gate.
    await panel.waitForSelector("#approve-params", { timeout: 30000 });

    // The password must be offered as a REQUIRED secret param even though the
    // proposer never mentioned it, and the user must not be able to drop it.
    const secretLocked = await panel.evaluate(() => {
      const row = document.querySelector(".param-secret");
      const include = row?.querySelector<HTMLInputElement>(".param-include");
      return { present: !!row, disabled: include?.disabled === true };
    });
    expect(secretLocked).toEqual({ present: true, disabled: true });

    await panel.click("#approve-params");

    // Approval advances script → export; the export button carries the final skill.
    await panel.waitForSelector("#export-skill", { timeout: 15000 });
    await panel.click("#export-skill");
    await panel.waitForFunction(
      () => Object.keys((window as any).__written ?? {}).length > 0,
      undefined,
      { timeout: 15000 },
    );

    const written = (await panel.evaluate(() => (window as any).__written)) as Record<string, string>;
    const skillMdPath = Object.keys(written).find((p) => p.endsWith("SKILL.md"));
    expect(skillMdPath).toBeDefined();
    // Written under skillwright/<slug>/.
    expect(skillMdPath!.startsWith("skillwright/")).toBe(true);

    const skillMd = written[skillMdPath!]!;
    // The whole point of Task 6.0: approved params reach the artifact.
    expect(skillMd).toContain("skillwright-inputs:");
    const inputsLine = skillMd.split("\n").find((l) => l.includes("skillwright-inputs:"))!;
    expect(inputsLine).toContain("username");
    expect(inputsLine).toContain("password");

    // And the real secret NEVER lands in the exported artifact.
    for (const content of Object.values(written)) {
      expect(content).not.toContain("hunter2-super-secret");
    }

    await page.close();
    await panel.close();
  }, 120000);
});

/**
 * The regression this exists to prevent: the panel used to DEAD-END at
 * parameterize when no LLM was configured, so a user without an API key could
 * never get a skill out of the extension at all. The previous e2e missed it
 * because it injected settings into chrome.storage before driving the panel.
 *
 * No key here. No provider route. Nothing stubbed but the directory picker.
 */
describe("built MV3 extension — pipeline with NO API key", () => {
  test("still reaches export, and the secret is still a required parameter", async (t) => {
    if (!available) t.skip();
    const id = new URL(sw!.url()).host;

    const panel = await ctx!.newPage();
    await panel.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      const written: Record<string, string> = {};
      w.__written = written;
      const makeDir = (base: string): unknown => ({
        getDirectoryHandle: async (name: string) => makeDir(`${base}${name}/`),
        getFileHandle: async (name: string) => ({
          createWritable: async () => ({
            write: async (data: string) => {
              written[`${base}${name}`] = data;
            },
            close: async () => {},
          }),
        }),
      });
      w.showDirectoryPicker = async () => makeDir("");
    });

    // Any call to a provider would be a bug: there is no key to call with.
    let providerCalls = 0;
    await panel.route("https://api.anthropic.com/**", async (route) => {
      providerCalls++;
      await route.abort();
    });
    await panel.route("https://api.openai.com/**", async (route) => {
      providerCalls++;
      await route.abort();
    });

    await panel.goto(`chrome-extension://${id}/src/panel.html`);
    // Explicitly ensure no settings exist.
    await panel.evaluate(() => chrome.storage.local.remove("llmSettings"));

    await panel.evaluate(() => chrome.runtime.sendMessage({ kind: "start", title: "no key run" }));

    const page = await ctx!.newPage();
    await page.goto(fx.url);
    await page.getByLabel("Username").fill("demo-user");
    await page.getByLabel("Username").blur();
    await page.getByLabel("Password").fill("hunter2-super-secret");
    await page.getByLabel("Password").blur();
    await page.waitForTimeout(300);

    await panel.evaluate(() => chrome.runtime.sendMessage({ kind: "stop" }));

    // The approval gate still appears — degraded, not dead.
    await panel.waitForSelector("#approve-params", { timeout: 30000 });
    expect(await panel.textContent("#stage-parameterize")).toContain("only secrets were parameterized");

    // The deterministic floor fired with no model involved at all.
    const secret = await panel.evaluate(() => {
      const row = document.querySelector(".param-secret");
      return {
        present: !!row,
        locked: row?.querySelector<HTMLInputElement>(".param-include")?.disabled === true,
      };
    });
    expect(secret).toEqual({ present: true, locked: true });

    await panel.click("#approve-params");
    await panel.waitForSelector("#export-skill", { timeout: 15000 });
    await panel.click("#export-skill");
    await panel.waitForFunction(() => Object.keys((window as any).__written ?? {}).length > 0, undefined, {
      timeout: 15000,
    });

    const written = (await panel.evaluate(() => (window as any).__written)) as Record<string, string>;
    const skillMd = written[Object.keys(written).find((p) => p.endsWith("SKILL.md"))!]!;
    expect(skillMd).toContain("skillwright-inputs:");
    expect(skillMd).toContain("password");
    for (const content of Object.values(written)) {
      expect(content).not.toContain("hunter2-super-secret");
    }

    expect(providerCalls).toBe(0);

    await page.close();
    await panel.close();
  }, 120000);
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
