// Exploratory dogfood: run the REAL replay pipeline against a REAL public site
// (not the fixture) to surface real-world robustness bugs. Not a committed test
// (external sites are flaky); findings become fixes + fixture regressions.
import { chromium } from "playwright";
import { runSkill, PlaywrightStepDriver } from "skillwright";

const SITE = "https://the-internet.herokuapp.com/add_remove_elements/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const log = (m) => console.log(m);

  try {
    await page.goto(SITE, { timeout: 20000 });
    log(`loaded ${SITE}`);

    // A realistic recording against this real page: add an element (mutating),
    // then delete it (destructive). Selector stacks mirror what capture produces.
    const steps = [
      { type: "click", effect: "mutating", selectors: ["text/Add Element", "button[onclick*='addElement']"] },
      { type: "click", effect: "destructive", selectors: ["aria/Delete", ".added-manually", "text/Delete"] },
    ];

    const before = await page.locator(".added-manually").count();
    log(`.added-manually before: ${before}`);

    const driver = new PlaywrightStepDriver(page, 4000);
    const result = await runSkill(steps, driver, { confirmDestructive: true });
    log(`replay result: ${result.status}`);
    if (result.status !== "ok") log(`report: ${JSON.stringify(result.report)}`);

    const after = await page.locator(".added-manually").count();
    log(`.added-manually after: ${after}`);
    log(after === 0 && result.status === "ok" ? "DOGFOOD PASS — added then deleted on a real site" : "DOGFOOD ISSUE");
  } catch (e) {
    log(`DOGFOOD ERROR: ${e.message}`);
  } finally {
    await browser.close();
  }
}
main();
