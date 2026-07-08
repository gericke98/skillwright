// Dogfood a CUSTOM (ARIA) combobox — the React-Select / MUI pattern that's
// everywhere in real apps, unlike a native <select>. It's a button that opens a
// listbox; the option only exists/visible after opening, and gets clicked. This
// stresses: (a) clicking a widget, (b) clicking a dynamically-revealed option,
// (c) selector stability for listbox options. First we inspect the real DOM so
// the selectors are honest, then we replay and assert the value actually changed.
import { chromium } from "playwright";
import { runSkill, PlaywrightStepDriver } from "skillwright";

const SITE =
  "https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(SITE, { timeout: 30000, waitUntil: "domcontentloaded" });
    // The example lives in an iframe on the APG page; find the combobox frame.
    const frame =
      page.frames().find((f) => f.url().includes("combobox-select-only")) ?? page.mainFrame();
    const combo = frame.locator('[role="combobox"]').first();
    await combo.waitFor({ timeout: 10000 });
    const before = (await combo.textContent())?.trim();

    // A concrete, real option (this select-only combobox lists fruit).
    const target = "Banana";
    console.log(`combobox start="${before}"; target option="${target}"`);

    // Two captured clicks: open the combobox, then pick the option by its text —
    // exactly the selector shapes the capture pipeline emits (text/ then a css
    // fallback). The driver auto-searches child frames, so we drive the top page.
    const steps = [
      { type: "click", effect: "mutating", selectors: ['[role="combobox"]'] },
      { type: "click", effect: "mutating", selectors: [`text/${target}`, `[role="option"]`] },
    ];
    const driver = new PlaywrightStepDriver(page, 8000);
    const result = await runSkill(steps, driver, { confirmDestructive: true });

    const after = (await combo.textContent())?.trim();
    const changed = !!after && after !== before && after.includes(target);
    console.log(`replay: ${result.status}; combobox now="${after}"`);
    console.log(
      result.status === "ok" && changed
        ? "DOGFOOD PASS — replayed a custom ARIA combobox selection"
        : `DOGFOOD ISSUE (status=${result.status}, changed=${changed}) ${JSON.stringify(result.report ?? {})}`,
    );
  } catch (e) {
    console.log(`DOGFOOD ERROR: ${e.message}`);
  } finally {
    await browser.close();
  }
}
main();
