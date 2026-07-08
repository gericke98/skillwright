import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import type { Recording } from "@skillwright/shared";
import { defaultLibraryDir } from "./paths";
import { toReplaySteps } from "./to-replay-steps";
import { runSkill, type ReplayResult } from "./replay";
import { applyInputs } from "./apply-inputs";
import { PlaywrightStepDriver } from "./playwright-driver";
import { applyPromotedOverlay, buildHealer, confirmCleanRun, makeOnHeal } from "./heal-wiring";

export interface RunSkillOptions {
  confirmDestructive: boolean;
  cdpUrl: string;
  libraryDir?: string;
  /** Runtime inputs substituted into `{placeholder}` step values/selectors. */
  inputs?: Record<string, string>;
  /** Replay steps via their captured request instead of the DOM when available. */
  apiReplay?: boolean;
  /** Per-step driver timeout in ms; overrides the driver default for slow apps. */
  timeoutMs?: number;
}

/**
 * Load a distilled skill's recording, connect to a CDP endpoint (the relay, a
 * debug-profile Chrome, or CI Chromium — the driver is indifferent), and replay
 * it against the first available page. Returns the structured ReplayResult.
 */
export async function runSkillByName(slug: string, opts: RunSkillOptions): Promise<ReplayResult> {
  const dir = join(opts.libraryDir ?? defaultLibraryDir(), slug);
  const recording = JSON.parse(
    readFileSync(join(dir, "assets", "recording.json"), "utf8"),
  ) as Recording;
  const overlaid = toReplaySteps(recording);
  applyPromotedOverlay(overlaid, dir);
  // Substitute runtime inputs before opening a browser — a missing input fails
  // fast (throws MissingInputError) without touching the page.
  const steps = applyInputs(overlaid, opts.inputs ?? {});

  const browser = await chromium.connectOverCDP(opts.cdpUrl);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    const driver = new PlaywrightStepDriver(page, opts.timeoutMs);
    const result = await runSkill(steps, driver, {
      confirmDestructive: opts.confirmDestructive,
      heal: buildHealer(),
      onHeal: makeOnHeal(dir),
      apiReplay: opts.apiReplay,
    });
    if (result.status === "ok") confirmCleanRun(dir);
    return result;
  } finally {
    await browser.close();
  }
}
