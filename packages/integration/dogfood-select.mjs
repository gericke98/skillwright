// Dogfood replay of a <select> change on a real site. The driver fills value
// actions with loc.fill(), which does NOT work on <select> — likely a real bug.
import { chromium } from "playwright";
import { runSkill, PlaywrightStepDriver } from "skillwright";

const SITE = "https://the-internet.herokuapp.com/dropdown";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(SITE, { timeout: 20000 });
    // A recorded "change" on the <select id=dropdown> picking option value "2".
    const steps = [
      { type: "change", effect: "mutating", selectors: ["#dropdown"], value: "2" },
    ];
    const driver = new PlaywrightStepDriver(page, 4000);
    const result = await runSkill(steps, driver, { confirmDestructive: true });
    const selected = await page.locator("#dropdown").inputValue();
    console.log(`replay: ${result.status}; selected value: ${selected}`);
    console.log(result.status === "ok" && selected === "2"
      ? "DOGFOOD PASS — select replayed"
      : `DOGFOOD ISSUE — select not set (${result.status}, value=${selected})`);
  } catch (e) {
    console.log(`DOGFOOD ERROR: ${e.message}`);
  } finally {
    await browser.close();
  }
}
main();
