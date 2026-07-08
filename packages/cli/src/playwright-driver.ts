import type { Frame, Locator, Page } from "playwright";
import type { PageSnapshot, ReplayStep, StepDriver, StepOutcome, StepRequest } from "./replay";
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

  private locatorIn(scope: Page | Frame, selector: string): Locator {
    const d = translateSelector(selector);
    switch (d.kind) {
      case "label":
        return scope.getByLabel(d.value);
      case "text":
        return scope.getByText(d.value, { exact: true });
      case "css":
        return scope.locator(d.value);
    }
  }

  /** Resolve a locator, searching the main frame first and then child frames
   * (same-origin iframes) so a step targeting an embedded frame still resolves. */
  private async locator(selector: string): Promise<Locator> {
    const main = this.locatorIn(this.page, selector).first();
    try {
      if ((await main.count()) > 0) return main;
    } catch {
      /* fall through to frames */
    }
    for (const frame of this.page.frames()) {
      if (frame === this.page.mainFrame()) continue;
      try {
        const loc = this.locatorIn(frame, selector).first();
        if ((await loc.count()) > 0) return loc;
      } catch {
        /* cross-origin / detached frame — skip */
      }
    }
    return main; // nothing matched — return main so execute fails/times out cleanly
  }

  /** The live page view handed to the tier-3 healer: URL + ARIA snapshot. */
  async snapshot(): Promise<PageSnapshot> {
    const aria = await this.page.locator("body").ariaSnapshot();
    return { url: this.page.url(), aria };
  }

  /** API-replay: re-issue the captured request via the context's request API,
   * which carries the authenticated session's cookies. */
  async executeRequest(request: StepRequest): Promise<StepOutcome> {
    try {
      const res = await this.page.context().request.fetch(request.url, {
        method: request.method,
        ...(request.body !== undefined ? { data: request.body } : {}),
        timeout: this.timeoutMs,
      });
      return res.ok() ? "ok" : "fail";
    } catch {
      return "fail";
    }
  }

  async execute(step: ReplayStep, selector: string): Promise<StepOutcome> {
    try {
      // Navigation doesn't need an element; everything else resolves a locator
      // (searching child frames for same-origin iframes).
      if (step.type === "navigate") {
        if (step.url) await this.page.goto(step.url, { timeout: this.timeoutMs });
        return "ok";
      }
      const loc = await this.locator(selector);
      switch (step.type) {
        case "change":
        case "input":
        case "select": {
          const value = step.value ?? "";
          // A <select> can't be filled — it must be selected by option value; a
          // checkbox/radio can't be filled either — fill() throws, so drive its
          // checked state instead (idempotent with any paired click step).
          const { tag, type } = await loc
            .evaluate((el) => ({ tag: el.tagName, type: (el as HTMLInputElement).type }))
            .catch(() => ({ tag: "", type: "" }));
          if (tag === "SELECT") await loc.selectOption(value, { timeout: this.timeoutMs });
          else if (type === "checkbox" || type === "radio")
            await loc.setChecked(value === "true", { timeout: this.timeoutMs });
          else if (type === "file")
            // The file path comes from a runtime --input (applyInputs already
            // resolved the {file} placeholder); fill() throws on a file input.
            await loc.setInputFiles(value, { timeout: this.timeoutMs });
          else await loc.fill(value, { timeout: this.timeoutMs });
          return "ok";
        }
        case "click":
          await loc.click({ timeout: this.timeoutMs });
          return "ok";
        case "keydown":
          await loc.press(step.key ?? "Enter", { timeout: this.timeoutMs });
          return "ok";
        default:
          return "ok";
      }
    } catch {
      return "fail";
    }
  }
}
