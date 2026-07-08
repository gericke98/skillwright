// Dogfood selector UNIQUENESS on a real list (repeated identical elements) — a
// top selector that matches many elements would click the wrong one.
import { chromium } from "playwright";
import { Window } from "happy-dom";
import { computeSelectorStack } from "@skillwright/extension";

const SITE = "https://the-internet.herokuapp.com/add_remove_elements/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(SITE, { timeout: 20000 });
    // Create a LIST: 3 identical Delete buttons.
    for (let i = 0; i < 3; i++) await page.getByText("Add Element").click();
    const html = await page.content();

    const window = new Window({ url: SITE });
    window.document.body.innerHTML = html;
    const doc = window.document;
    const deletes = [...doc.querySelectorAll(".added-manually")];
    console.log(`${deletes.length} identical Delete buttons`);

    const countFor = (sel) => {
      if (sel.startsWith("text/")) {
        const t = sel.slice(5);
        return [...doc.querySelectorAll("button,a,[role]")].filter((e) => e.textContent.trim() === t).length;
      }
      if (sel.startsWith("aria/")) {
        const n = sel.slice(5);
        return doc.querySelectorAll(`[aria-label="${n}"]`).length;
      }
      try { return doc.querySelectorAll(sel).length; } catch { return -1; }
    };

    let issues = 0;
    deletes.forEach((el, i) => {
      const stack = computeSelectorStack(el);
      const top = stack[0];
      const topCount = countFor(top);
      const firstUnique = stack.find((s) => countFor(s) === 1);
      const ok = topCount === 1;
      if (!ok) issues++;
      console.log(`  delete[${i}]: top="${top}" matches ${topCount} | firstUnique="${firstUnique ?? "(none!)"}"`);
    });

    console.log(issues > 0
      ? `NOTE: ${issues}/3 buttons lead with a NON-UNIQUE selector — replay would fail-over (Playwright) or click the wrong one (relay)`
      : "DOGFOOD PASS — every button leads with a unique selector");
  } catch (e) {
    console.log(`DOGFOOD ERROR: ${e.message}`);
  } finally {
    await browser.close();
  }
}
main();
