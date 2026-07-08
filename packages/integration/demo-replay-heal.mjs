// Generates a REAL browser-replay demo GIF: skillwright replaying a skill against
// the fixture app, hitting a broken selector, self-healing (Tier 3), and deleting
// the row — recorded via Playwright video → ffmpeg GIF. Honest, reproducible.
//
//   node scripts/demo/replay-heal-demo.mjs
//
// Output: docs/assets/replay-heal.gif
import { chromium } from "playwright";
import { startFixtureServer } from "@skillwright/fixture-app";
import { runSkill, PlaywrightStepDriver } from "skillwright";
import { mkdtempSync, readdirSync, renameSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const W = 1000, H = 640;
const REPO = "/Users/santiagogerickeparga/Proyectos/chrome-extension-learning";

async function caption(page, text, sub = "") {
  await page.evaluate(
    ({ text, sub }) => {
      let el = document.getElementById("sw-cap");
      if (!el) {
        el = document.createElement("div");
        el.id = "sw-cap";
        el.style.cssText =
          "position:fixed;left:0;right:0;bottom:0;z-index:99999;font:600 18px/1.4 ui-monospace,Menlo,monospace;" +
          "background:linear-gradient(0deg,rgba(10,12,20,.96),rgba(10,12,20,.82));color:#e8ecf4;padding:14px 20px;" +
          "border-top:2px solid #6ee7ff;letter-spacing:.2px";
        document.body.appendChild(el);
      }
      el.innerHTML = `<span style="color:#6ee7ff">skillwright</span> ${text}` +
        (sub ? `<div style="font-weight:400;font-size:14px;color:#9aa4b2;margin-top:2px">${sub}</div>` : "");
    },
    { text, sub },
  );
}

async function main() {
  const fx = await startFixtureServer(0);
  const videoDir = mkdtempSync(join(tmpdir(), "sw-vid-"));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: videoDir, size: { width: W, height: H } },
  });
  const page = await context.newPage();
  await page.goto(fx.url);
  await caption(page, "run delete-invoice", "an agent replays a skill you demonstrated once");
  await page.waitForTimeout(1400);

  // The recorded skill's delete step — but the page changed and its whole
  // selector stack is stale. Only a heal recovers it.
  const steps = [
    { type: "change", effect: "mutating", selectors: ["aria/Search invoices"], value: "INV-001" },
    { type: "click", effect: "destructive", selectors: ["aria/GONE-delete-button"] },
  ];

  await caption(page, "Tier 1 · deterministic replay", "type the invoice number");
  const driver = new PlaywrightStepDriver(page, 3000);

  const heal = async (_step, snapshot) => {
    await caption(page, "Tier 3 · selector broke → healing", "reading the live page to find the control…");
    await page.waitForTimeout(1500);
    return snapshot.aria.includes("Delete invoice INV-001") ? "aria/Delete invoice INV-001" : null;
  };

  const result = await runSkill(steps, driver, { confirmDestructive: true, heal });
  await caption(
    page,
    result.status === "ok" ? "✓ healed & completed" : "failed",
    "the fix is quarantined — promoted to the skill only after it proves out",
  );
  await page.waitForTimeout(1800);

  await context.close(); // flushes the video
  await browser.close();
  await fx.close();

  const webm = join(videoDir, readdirSync(videoDir).find((f) => f.endsWith(".webm")));
  const outDir = join(REPO, "docs", "assets");
  mkdirSync(outDir, { recursive: true });
  const gif = join(outDir, "replay-heal.gif");
  // Two-pass palette for a clean, small GIF at ~12fps.
  const palette = join(videoDir, "palette.png");
  execFileSync("ffmpeg", ["-y", "-i", webm, "-vf", "fps=12,scale=1000:-1:flags=lanczos,palettegen", palette], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-y", "-i", webm, "-i", palette, "-lavfi", "fps=12,scale=1000:-1:flags=lanczos[x];[x][1:v]paletteuse", gif], { stdio: "ignore" });
  console.log("wrote", gif);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
