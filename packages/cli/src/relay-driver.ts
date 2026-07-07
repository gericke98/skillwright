import type { ReplayStep, StepDriver } from "./replay";

export interface PerformRequest {
  action: string;
  selector: string;
  value?: string;
}

export interface PerformResult {
  ok: boolean;
  error?: string;
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
      const res = await this.transport.send({ action: step.type, selector, value: step.value });
      return res.ok ? "ok" : "fail";
    } catch {
      return "fail";
    }
  }
}
