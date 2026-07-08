// Dogfood the passive network capture + redaction against REAL traffic: attach
// the NetworkCapturer to a real page load and verify requests are captured, URLs
// are redacted, and no obvious secret token survives.
import { chromium } from "playwright";
import { NetworkCapturer, valueLooksSecret } from "@skillwright/shared";

const SITE = "https://the-internet.herokuapp.com/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const capturer = new NetworkCapturer();
  await capturer.attach(cdp);

  try {
    // Navigate with a token in the query — the capturer must redact it.
    await page.goto(`${SITE}?access_token=ya29.SEKRET_TOKEN_abc123XYZ&ok=1`, { timeout: 20000 });
    await page.waitForTimeout(800);

    const reqs = capturer.collected();
    console.log(`captured ${reqs.length} requests`);
    const methods = [...new Set(reqs.map((r) => r.method))];
    console.log(`methods: ${methods.join(", ")}`);

    const issues = [];
    // No un-redacted secret token may survive in any captured URL.
    for (const r of reqs) {
      if (r.url.includes("ya29.SEKRET_TOKEN_abc123XYZ")) issues.push(`token leaked in ${r.url}`);
      // any secret-shaped token surviving in a captured URL is a leak
      for (const tok of r.url.split(/[/?&=]/)) {
        if (tok.length > 15 && valueLooksSecret(tok) && !tok.includes("{secret}")) {
          issues.push(`secret-shaped token survived: ${tok.slice(0, 20)}… in ${r.url.slice(0, 60)}`);
        }
      }
    }
    const sample = reqs.find((r) => r.url.includes("the-internet"));
    if (sample) console.log(`sample redacted url: ${sample.url}`);

    console.log(issues.length ? `DOGFOOD ISSUES:\n  ${issues.join("\n  ")}` : "DOGFOOD PASS — network capture + redaction sane on real traffic");
  } catch (e) {
    console.log(`DOGFOOD ERROR: ${e.message}`);
  } finally {
    await browser.close();
  }
}
main();
