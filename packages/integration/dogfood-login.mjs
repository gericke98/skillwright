// Dogfood the canonical day-to-day task: fill a multi-field form and submit it,
// on a real login flow (the-internet's OWN published test creds — not private).
import { chromium } from "playwright";
import { runSkill, PlaywrightStepDriver } from "skillwright";

const SITE = "https://the-internet.herokuapp.com/login";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(SITE, { timeout: 20000 });
    const steps = [
      { type: "change", effect: "mutating", selectors: ["#username", "[name=\"username\"]"], value: "tomsmith" },
      { type: "change", effect: "mutating", selectors: ["#password", "[name=\"password\"]"], value: "SuperSecretPassword!" },
      { type: "click", effect: "destructive", selectors: ["text/ Login", "button[type=submit]"] },
    ];
    const driver = new PlaywrightStepDriver(page, 5000);
    const result = await runSkill(steps, driver, { confirmDestructive: true });
    await page.waitForTimeout(800);
    const url = page.url();
    const flash = await page.locator("#flash").textContent().catch(() => "");
    console.log(`replay: ${result.status}; url: ${url}`);
    console.log(url.includes("/secure") || /logged into a secure area/i.test(flash ?? "")
      ? "DOGFOOD PASS — full form fill + submit logged in on a real site"
      : `DOGFOOD ISSUE — login did not complete (${result.status}) ${JSON.stringify(result.report ?? {})}`);
  } catch (e) {
    console.log(`DOGFOOD ERROR: ${e.message}`);
  } finally {
    await browser.close();
  }
}
main();
