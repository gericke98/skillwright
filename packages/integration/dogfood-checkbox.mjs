// Repro: capture emits a value-bearing `change` step for a checkbox toggle, and
// the driver replays a `change` via loc.fill() — but Playwright THROWS when you
// fill a checkbox. So a captured checkbox interaction fails on replay. Same class
// of bug as the earlier native-<select> fix.
import { chromium } from "playwright";
import { runSkill, PlaywrightStepDriver } from "skillwright";

const SITE = "https://the-internet.herokuapp.com/checkboxes";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(SITE, { timeout: 20000 });
    const box1 = page.locator("#checkboxes input").first();
    const wasChecked = await box1.isChecked();

    // What capture produces for toggling checkbox 1: a `change` step whose value
    // reflects the post-toggle checked state (the fix), targeting the input.
    const steps = [
      {
        type: "change",
        effect: "mutating",
        selectors: ["#checkboxes input:nth-of-type(1)", "input[type=checkbox]"],
        value: String(!wasChecked),
      },
    ];
    const result = await runSkill(steps, new PlaywrightStepDriver(page, 5000), {
      confirmDestructive: true,
    });
    const nowChecked = await box1.isChecked();
    const toggled = nowChecked === !wasChecked;
    console.log(`replay: ${result.status}; checkbox ${wasChecked} -> ${nowChecked}`);
    console.log(
      result.status === "ok" && toggled
        ? "DOGFOOD PASS — checkbox toggled via change step"
        : `DOGFOOD ISSUE (status=${result.status}, toggled=${toggled}) ${JSON.stringify(result.report ?? {})}`,
    );
  } catch (e) {
    console.log(`DOGFOOD ERROR: ${e.message}`);
  } finally {
    await browser.close();
  }
}
main();
