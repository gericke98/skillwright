// Probe: a captured <input type=file> change step. Capture currently records the
// browser's fake path ("C:\fakepath\...") as value, and replay does fill() —
// which THROWS on a file input. So a file-upload step fails on replay. And even
// if it didn't, the fake path is unreplayable across machines. This probes both
// the current (broken) behavior and the desired fix (setInputFiles + runtime input).
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { runSkill, PlaywrightStepDriver } from "skillwright";

const HTML = `data:text/html,<input id="f" type="file" aria-label="Attach receipt" />`;
const TMP = "/private/tmp/claude-501/-Users-santiagogerickeparga-Proyectos-chrome-extension-learning/e13d0e7d-42c1-459c-b3b6-8d211f6bb9d0/scratchpad/receipt.txt";

async function main() {
  writeFileSync(TMP, "dummy receipt");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(HTML);
    // Fixed flow: capture emits value "{file}"; applyInputs substitutes the real
    // path from --input file=<path>; the driver uses setInputFiles.
    const steps = [
      { type: "change", effect: "mutating", selectors: ["#f", "input[type=file]"], value: TMP },
    ];
    const result = await runSkill(steps, new PlaywrightStepDriver(page, 4000), { confirmDestructive: true });
    const attached = await page.locator("#f").evaluate((el) => el.files?.length ?? 0);
    console.log(`fixed behavior — replay via setInputFiles: ${result.status}; files attached=${attached}`);
    console.log(result.status === "ok" && attached === 1
      ? "DOGFOOD PASS — file upload replays via setInputFiles + runtime {file} input"
      : `DOGFOOD ISSUE (status=${result.status}, attached=${attached}) ${JSON.stringify(result.report ?? {})}`);
  } catch (e) {
    console.log(`PROBE ERROR: ${e.message}`);
  } finally {
    await browser.close();
  }
}
main();
