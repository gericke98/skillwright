// Dogfood selector computation on a real modern SPA (framework-rendered DOM,
// hashed classes, icon-only buttons) — where anchors are often weak.
import { chromium } from "playwright";
import { Window } from "happy-dom";
import { computeSelectorStack } from "@skillwright/extension";

const SITE = "https://demo.playwright.dev/todomvc/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(SITE, { timeout: 20000 });
    await page.getByPlaceholder("What needs to be done?").fill("buy milk");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const html = await page.content();
    console.log(`rendered ${html.length} bytes`);

    const window = new Window({ url: SITE });
    window.document.body.innerHTML = html;
    const doc = window.document;

    const probe = (label, sel) => {
      const el = doc.querySelector(sel);
      if (!el) return console.log(`  [missing] ${label} (${sel})`);
      const stack = computeSelectorStack(el);
      const top = stack[0] ?? "(none)";
      const stable =
        top.startsWith("aria/") || top.startsWith("text/") || top.startsWith("#") ||
        top.startsWith("[data-") || top.startsWith("[name=") || top.startsWith("[placeholder=");
      console.log(`  ${label}: top=${top} ${stable ? "STABLE" : "BRITTLE(positional-only)"} | stack size ${stack.length}`);
      return { stable, stack };
    };

    console.log("selector quality on a real SPA:");
    const input = probe("new-todo input", ".new-todo, input[placeholder]");
    const item = probe("todo item", ".todo-list li");
    const toggle = probe("toggle checkbox", ".todo-list li .toggle");
    const destroy = probe("destroy button (icon-only)", ".todo-list li .destroy");

    const brittle = [input, item, toggle, destroy].filter((r) => r && !r.stable).length;
    console.log(brittle > 0
      ? `NOTE: ${brittle} element(s) had only a brittle positional anchor — icon/framework elements are the weak spot`
      : "DOGFOOD PASS — every probed element had a stable anchor");
  } catch (e) {
    console.log(`DOGFOOD ERROR: ${e.message}`);
  } finally {
    await browser.close();
  }
}
main();
