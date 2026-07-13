// Dogfood: run the REAL parameterize pass (proposer -> critic -> deterministic
// reconcile) over a recording captured from a REAL public login form, with a
// REAL LLM backend, and print the FinalParam[] the panel would ask you to
// approve.
//
// What this is checking that unit tests can't: whether a real model, looking at
// a real form, proposes sane parameters — and, more importantly, that the
// SECRET FLOOR holds no matter what it says. The floor is deterministic code,
// not a prompt: a password step is forced to a required secret param even if
// the model never mentions it (or tries to mark it optional).
//
// Usage (tsx loader: this imports @skillwright/shared from TS source):
//   node --import tsx packages/integration/dogfood-parameterize.mjs
// Backend comes from the same factory the CLI uses: an agent-cli binary on
// PATH, or SKILLWRIGHT_API_KEY=sk-... for the API backend.
//
// Verified 2026-07-12 against agent-cli:claude — the proposer named `username`
// and said nothing about the password; the floor added it as a required,
// valueless secret anyway. That's the point.
import { chromium } from "playwright";
import { parameterize, secretNamesOf, PLACEHOLDER } from "@skillwright/shared";
import { createDefaultBackend } from "skillwright";

const SITE = "https://the-internet.herokuapp.com/login";

/** What capture would record for filling this login form (password redacted at
 *  capture time — the real value NEVER reaches the model). */
function recordingFor(username) {
  return {
    title: "Sign in to the app",
    steps: [
      { type: "change", selectors: [["aria/Username"], ["#username"]], value: username, timestamp: 1 },
      { type: "change", selectors: [["aria/Password"], ["#password"]], value: PLACEHOLDER, timestamp: 2 },
      { type: "click", selectors: [["text/Login"], ["button[type=submit]"]], timestamp: 3 },
    ],
    "x-skillwright": {
      version: 1,
      segment: { id: "dogfood", parentSkill: null, recordedAt: new Date().toISOString() },
    },
  };
}

async function main() {
  // Prove the form is really shaped the way the recording claims.
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(SITE, { timeout: 20000 });
    const hasPassword = (await page.locator("#password").count()) === 1;
    if (!hasPassword) throw new Error("fixture site changed: no #password field");
    console.log(`site ok: ${SITE} has a username + password form`);
  } finally {
    await browser.close();
  }

  const recording = recordingFor("tomsmith");
  const backend = createDefaultBackend();
  console.log(`backend: ${backend.name}`);

  const secrets = secretNamesOf(recording, []);
  console.log(`secret floor (derived WITHOUT the model): [${[...secrets].join(", ")}]`);

  const params = await parameterize(recording, backend);

  console.log("\nFinalParam[] — what the panel would ask you to approve:\n");
  for (const p of params) {
    console.log(
      `  ${p.name}\n` +
        `    type=${p.type} required=${p.required} confidence=${p.confidence}\n` +
        `    demoValue=${JSON.stringify(p.demoValue)}\n` +
        `    why: ${p.rationale}`,
    );
  }

  // The invariant that must hold regardless of what the model said.
  const password = params.find((p) => secrets.has(p.name));
  const failures = [];
  if (!password) failures.push("the password never became a parameter");
  else {
    if (password.required !== true) failures.push("the secret param is not required");
    if (password.type !== "string") failures.push(`the secret param's type was not forced to string`);
    if (password.demoValue !== "") failures.push("the secret param carries a demo value");
  }
  if (params.some((p) => JSON.stringify(p).includes(PLACEHOLDER))) {
    failures.push("the redaction placeholder leaked into a param");
  }

  if (failures.length > 0) {
    console.error(`\nSECRET FLOOR BROKEN:\n - ${failures.join("\n - ")}`);
    process.exit(1);
  }
  console.log("\nsecret floor held: password is a required, valueless, string secret param.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
