import type { PageSnapshot, ReplayStep, StepDriver } from "./replay";

export interface PerformRequest {
  action: string;
  selector: string;
  value?: string;
  key?: string;
  /** Modifiers held for a keydown — a captured Cmd+S sent without them replays
   *  as typing an "s" into the page. */
  modifiers?: string[];
}

export interface PerformResult {
  ok: boolean;
  error?: string;
  /** For a "snapshot" request: the live page view (heal over the relay). */
  url?: string;
  aria?: string;
}

/** Abstracts sending one perform command and awaiting its result. The WS relay
 *  provides the real transport; tests inject a fake. */
export interface RelayTransport {
  send(req: PerformRequest): Promise<PerformResult>;
}

/**
 * StepDriver that performs each step by asking the extension (over the relay
 * transport) to execute it as a trusted chrome.debugger action. Implements the
 * same interface as PlaywrightStepDriver, so runSkill + the safety gate are
 * unchanged.
 */
export class RelayStepDriver implements StepDriver {
  constructor(private readonly transport: RelayTransport) {}

  async execute(step: ReplayStep, selector: string): Promise<"ok" | "fail"> {
    try {
      const res = await this.transport.send({
        action: step.type,
        selector,
        value: step.value,
        key: step.key,
        modifiers: step.modifiers,
      });
      return res.ok ? "ok" : "fail";
    } catch {
      return "fail";
    }
  }

  /** Ask the extension for the live page view so tier-3 heal works over the relay
   * (against the user's real authenticated Chrome), not just the cdp path. */
  async snapshot(): Promise<PageSnapshot> {
    const res = await this.transport.send({ action: "snapshot", selector: "" });
    return { url: res.url ?? "", aria: res.aria ?? "" };
  }
}
