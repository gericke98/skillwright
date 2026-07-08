// Dogfood the CAPTURE + DISTILL side against real fetched HTML (not the fixture):
// compute selector stacks off real markup, build a recording, distill it, and
// sanity-check the skill. Surfaces selector/redaction/distill gaps on real DOM.
import { Window } from "happy-dom";
import { computeSelectorStack } from "@skillwright/extension";
import { redactValue } from "@skillwright/extension";
import { distill } from "skillwright";

const SITE = "https://the-internet.herokuapp.com/login";

async function main() {
  const res = await fetch(SITE);
  const html = await res.text();
  console.log(`fetched ${html.length} bytes from ${SITE}`);

  const window = new Window({ url: SITE });
  window.document.body.innerHTML = html;
  const doc = window.document;

  const pick = (sel) => {
    const el = doc.querySelector(sel);
    if (!el) return null;
    const stack = computeSelectorStack(el);
    console.log(`  ${sel} → [${stack.join(" , ")}]`);
    return stack;
  };

  console.log("selector stacks on real DOM:");
  const userStack = pick("#username");
  const passStack = pick("#password");
  const btnStack = pick("button[type=submit]");

  const issues = [];
  if (!userStack?.length) issues.push("no stack for username");
  if (!passStack?.length) issues.push("no stack for password");
  if (!btnStack?.length) issues.push("no stack for submit button");

  // Build a recording and distill it (zero-LLM) — check password redaction + shape.
  const recording = {
    title: "Log in to the-internet",
    steps: [
      { type: "change", selectors: userStack?.map((s) => [s]) ?? [], value: "tomsmith" },
      { type: "change", selectors: passStack?.map((s) => [s]) ?? [], value: redactValue("SuperSecretPassword!", { type: "password" }) },
      { type: "click", selectors: btnStack?.map((s) => [s]) ?? [] },
    ],
    "x-skillwright": { version: 1, segment: { id: "s", parentSkill: null, recordedAt: "2026-07-08" } },
  };

  const skill = distill(recording, {});
  const serialized = JSON.stringify(skill.files);
  if (serialized.includes("SuperSecretPassword")) issues.push("PASSWORD LEAKED into skill");
  if (!skill.files["SKILL.md"]?.includes("name:")) issues.push("SKILL.md missing frontmatter");
  console.log(`distilled slug: ${skill.slug}`);
  console.log(`password redacted: ${!serialized.includes("SuperSecretPassword")}`);

  console.log(issues.length ? `DOGFOOD ISSUES: ${issues.join("; ")}` : "DOGFOOD PASS — capture+distill sane on real HTML");
}
main().catch((e) => console.log(`DOGFOOD ERROR: ${e.message}`));
