// Probe: can the replay driver set text in a contenteditable (Gmail/Slack/Notion
// style editor)? Playwright fill() is documented to support contenteditable, but
// the relay path sets el.value (a no-op on a div). Prove the DOM path works so
// the fix is only about CAPTURE recording the text + the relay path.
import { chromium } from "playwright";
import { runSkill, PlaywrightStepDriver } from "skillwright";

const HTML = `data:text/html,<div id="ed" contenteditable="true" aria-label="Message body" style="border:1px solid"></div>`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(HTML);
    const steps = [
      { type: "change", effect: "mutating", selectors: ['[contenteditable]', "#ed"], value: "Hello team" },
    ];
    const result = await runSkill(steps, new PlaywrightStepDriver(page, 4000), { confirmDestructive: true });
    const text = (await page.locator("#ed").textContent())?.trim();
    console.log(`replay: ${result.status}; contenteditable text="${text}"`);
    console.log(result.status === "ok" && text === "Hello team"
      ? "PROBE PASS — DOM driver fills contenteditable; only capture+relay need work"
      : `PROBE: DOM path needs work too (status=${result.status}, text="${text}")`);
  } catch (e) {
    console.log(`PROBE ERROR: ${e.message}`);
  } finally {
    await browser.close();
  }
}
main();
