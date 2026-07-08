// Dogfood a multi-page flow on a real site: click a link that navigates to a new
// page, then interact with an element on that page. Cross-page skills are core to
// real day-to-day usage.
import { chromium } from "playwright";
import { runSkill, PlaywrightStepDriver } from "skillwright";

const SITE = "https://the-internet.herokuapp.com/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(SITE, { timeout: 20000 });
    const steps = [
      // page 1: click a link that navigates to /dropdown
      { type: "click", effect: "mutating", selectors: ["text/Dropdown", "a[href='/dropdown']"] },
      // page 2: select an option on the new page
      { type: "change", effect: "mutating", selectors: ["#dropdown"], value: "1" },
    ];
    const driver = new PlaywrightStepDriver(page, 5000);
    const result = await runSkill(steps, driver, { confirmDestructive: true });
    await page.waitForTimeout(400);
    const url = page.url();
    const selected = await page.locator("#dropdown").inputValue().catch(() => "");
    console.log(`replay: ${result.status}; url: ${url}; selected: ${selected}`);
    console.log(result.status === "ok" && url.includes("/dropdown") && selected === "1"
      ? "DOGFOOD PASS — cross-page flow (link → new page → interact) works"
      : `DOGFOOD ISSUE (${result.status}) ${JSON.stringify(result.report ?? {})}`);
  } catch (e) {
    console.log(`DOGFOOD ERROR: ${e.message}`);
  } finally {
    await browser.close();
  }
}
main();
