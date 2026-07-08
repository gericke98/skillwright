// Deepest real-world validation available without the user's own login: drive
// the FULL pipeline with the REAL extension on a REAL public site.
//   capture (real MV3 extension on the-internet/login) → recording.json
//   → assert the password was REDACTED (security, on a real form)
//   → distill → assert no secret leaked into SKILL.md
//   → replay the username fill on a fresh page → assert it works on real DOM
import { resolve } from "node:path";
import { chromium } from "playwright";
import { distill, toReplaySteps, runSkill, PlaywrightStepDriver } from "skillwright";

const EXT_DIR = resolve(process.cwd(), "../extension/dist-extension");
const SITE = "https://the-internet.herokuapp.com/login";

const log = (...a) => console.log(...a);

async function main() {
  const ctx = await chromium.launchPersistentContext("", {
    headless: false,
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker", { timeout: 30000 }));
    const id = new URL(sw.url()).host;

    // Panel page = chrome.runtime bridge. Stash the recording the background emits on stop.
    const panel = await ctx.newPage();
    await panel.goto(`chrome-extension://${id}/src/panel.html`);
    await panel.evaluate(() => {
      window.__rec = null;
      chrome.runtime.onMessage.addListener((m) => {
        if (m && m.kind === "recording") window.__rec = m.json;
      });
    });

    await panel.evaluate(() => chrome.runtime.sendMessage({ kind: "start", title: "Login to the app" }));

    // Perform a real login-form task; the content script captures it.
    const page = await ctx.newPage();
    await page.goto(SITE, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Username").fill("tomsmith");
    await page.getByLabel("Password").fill("SuperSecretPassword!");
    await page.getByRole("button", { name: /login/i }).click();
    await page.waitForTimeout(600);

    await panel.evaluate(() => chrome.runtime.sendMessage({ kind: "stop" }));
    await panel.waitForFunction(() => window.__rec !== null, { timeout: 5000 });
    const json = await panel.evaluate(() => window.__rec);
    const recording = JSON.parse(json);

    // 1) Capture happened.
    const changeSteps = recording.steps.filter((s) => s.type === "change");
    log(`captured ${recording.steps.length} steps (${changeSteps.length} field edits)`);

    // 2) SECURITY: the password must be redacted in the raw recording.
    const raw = JSON.stringify(recording);
    const leaked = raw.includes("SuperSecretPassword");
    log(`password in recording: ${leaked ? "LEAKED ❌" : "redacted ✓"}`);

    // 3) Distill → the skill directory; no secret may survive.
    const skill = distill(recording, {});
    const skillLeaked = Object.values(skill.files).some((f) => f.includes("SuperSecretPassword"));
    log(`password in distilled skill: ${skillLeaked ? "LEAKED ❌" : "redacted ✓"}`);

    // 4) Replay the username fill on a fresh real page.
    const steps = toReplaySteps(recording).filter((s) => s.type === "change" && s.value === "tomsmith");
    let replayOk = false;
    if (steps.length > 0) {
      const p2 = await ctx.newPage();
      await p2.goto(SITE, { waitUntil: "domcontentloaded" });
      const r = await runSkill(steps, new PlaywrightStepDriver(p2, 6000), { confirmDestructive: true });
      const val = await p2.getByLabel("Username").inputValue().catch(() => "");
      replayOk = r.status === "ok" && val === "tomsmith";
      log(`replay of username step: ${r.status}; field="${val}"`);
      await p2.close();
    }

    const pass = !leaked && !skillLeaked && changeSteps.length >= 2 && replayOk;
    log(pass
      ? "REAL ROUND-TRIP PASS — real extension captured a real login, redacted the secret, distilled clean, and replayed on real DOM"
      : "REAL ROUND-TRIP ISSUE — see lines above");
  } catch (e) {
    log(`ROUND-TRIP ERROR: ${e.message}`);
  } finally {
    await ctx.close();
  }
}
main();
