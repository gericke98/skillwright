// Dogfood async/dynamic content (common in real apps): an input that only becomes
// enabled after a delay. Replay must wait for it, not fail immediately.
import { chromium } from "playwright";
import { runSkill, PlaywrightStepDriver } from "skillwright";

const SITE = "https://the-internet.herokuapp.com/dynamic_controls";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(SITE, { timeout: 20000 });
    // Click "Enable" (the input becomes editable after a ~2-3s spinner), then type.
    const steps = [
      { type: "click", effect: "mutating", selectors: ["text/Enable", "#input-example button"] },
      { type: "change", effect: "mutating", selectors: ["#input-example input", "input[type=text]"], value: "hello" },
    ];
    const driver = new PlaywrightStepDriver(page, 8000); // generous timeout for async
    const result = await runSkill(steps, driver, { confirmDestructive: true });
    const value = await page.locator("#input-example input").inputValue().catch(() => "");
    console.log(`replay: ${result.status}; input value: "${value}"`);
    console.log(result.status === "ok" && value === "hello"
      ? "DOGFOOD PASS — replay waited for async-enabled input"
      : `DOGFOOD ISSUE (${result.status}) ${JSON.stringify(result.report ?? {})}`);
  } catch (e) {
    console.log(`DOGFOOD ERROR: ${e.message}`);
  } finally {
    await browser.close();
  }
}
main();
