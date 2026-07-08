import type { Locator, Page } from "playwright";
import type { PageSnapshot, ReplayStep, StepDriver, StepOutcome } from "./replay";
import { translateSelector } from "./translate-selector";

/**
 * The real replay driver: a thin adapter implementing the tested `StepDriver`
 * over a Playwright `Page`. `runSkill` owns all orchestration and the safety
 * gate; this only knows how to attempt one step with one selector. The Page can
 * come from `connectOverCDP` (the relay / a debug-profile Chrome) or a launched
 * browser — the driver is indifferent.
 */
export class PlaywrightStepDriver implements StepDriver {
  constructor(
    private readonly page: Page,
    private readonly timeoutMs = 3000,
  ) {}

  private locator(selector: string): Locator {
    const d = translateSelector(selector);
    switch (d.kind) {
      case "label":
        return this.page.getByLabel(d.value);
      case "text":
        return this.page.getByText(d.value, { exact: true });
      case "css":
        return this.page.locator(d.value);
    }
  }

  /** The live page view handed to the tier-3 healer: URL + ARIA snapshot. */
  async snapshot(): Promise<PageSnapshot> {
    const aria = await this.page.locator("body").ariaSnapshot();
    return { url: this.page.url(), aria };
  }

  async execute(step: ReplayStep, selector: string): Promise<StepOutcome> {
    const loc = this.locator(selector).first();
    try {
      switch (step.type) {
        case "change":
        case "input":
        case "select":
          await loc.fill(step.value ?? "", { timeout: this.timeoutMs });
          return "ok";
        case "click":
          await loc.click({ timeout: this.timeoutMs });
          return "ok";
        case "navigate":
          if (step.url) await this.page.goto(step.url, { timeout: this.timeoutMs });
          return "ok";
        default:
          return "ok";
      }
    } catch {
      return "fail";
    }
  }
}
