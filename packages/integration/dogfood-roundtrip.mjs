// Capstone dogfood: the FULL pipeline on a real site — compute selectors off real
// HTML, distill to a skill, then replay the distilled skill against a fresh load.
import { chromium } from "playwright";
import { Window } from "happy-dom";
import { computeSelectorStack } from "@skillwright/extension";
import { distill, toReplaySteps, runSkill, PlaywrightStepDriver } from "skillwright";

const SITE = "https://the-internet.herokuapp.com/add_remove_elements/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // 1. Load + reveal a Delete button, then read the rendered DOM.
    await page.goto(SITE, { timeout: 20000 });
    await page.getByText("Add Element").click();
    const html = await page.content();

    // 2. Compute selector stacks off the REAL rendered markup (as capture would).
    const window = new Window({ url: SITE });
    window.document.body.innerHTML = html;
    const doc = window.document;
    const stackFor = (el) => computeSelectorStack(el).map((s) => [s]);
    const addBtn = [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("Add Element"));
    const delBtn = doc.querySelector(".added-manually");

    const recording = {
      title: "Add then remove an element",
      steps: [
        { type: "click", selectors: stackFor(addBtn) },
        { type: "click", selectors: stackFor(delBtn) },
      ],
      "x-skillwright": { version: 1, segment: { id: "s", parentSkill: null, recordedAt: "2026-07-08" } },
    };
    console.log("selectors:", JSON.stringify(recording.steps.map((s) => s.selectors[0][0])));

    // 3. Distill (zero-LLM) → recording.json → replay steps.
    const skill = distill(recording, {});
    const distilled = JSON.parse(skill.files["assets/recording.json"]);
    const steps = toReplaySteps(distilled);
    console.log("effects:", steps.map((s) => s.effect).join(", "));

    // 4. Replay the distilled skill against a FRESH load.
    const fresh = await browser.newPage();
    await fresh.goto(SITE, { timeout: 20000 });
    const driver = new PlaywrightStepDriver(fresh, 4000);
    const result = await runSkill(steps, driver, { confirmDestructive: true });
    const remaining = await fresh.locator(".added-manually").count();

    console.log(`replay: ${result.status}; .added-manually remaining: ${remaining}`);
    console.log(result.status === "ok" && remaining === 0
      ? "DOGFOOD PASS — full capture→distill→replay round-trip works on a real site"
      : `DOGFOOD ISSUE ${JSON.stringify(result.report ?? {})}`);
  } catch (e) {
    console.log(`DOGFOOD ERROR: ${e.message}`);
  } finally {
    await browser.close();
  }
}
main();
