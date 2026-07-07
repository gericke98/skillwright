import type { Recording, Step } from "@bskill/shared";
import { redactUrl } from "./redact";
import { coalesceSteps } from "./coalesce";

/**
 * Injected sources of nondeterminism so the session is unit-testable. In the
 * extension these default to `crypto.randomUUID` and `new Date().toISOString()`.
 */
export interface SessionDeps {
  newId: () => string;
  now: () => string;
}

const defaultDeps: SessionDeps = {
  newId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
};

/**
 * Accumulates captured steps for one recording and assembles a single-segment
 * Recording on stop. Pure (no chrome.*): the background service worker is a
 * thin shell that feeds this from runtime messages. Enforces R2 (explicit
 * recording — no capture before an explicit start).
 */
export class RecordingSession {
  private active = false;
  private title = "";
  private steps: Step[] = [];
  private segmentId = "";
  private recordedAt = "";

  constructor(private readonly deps: SessionDeps = defaultDeps) {}

  get isRecording(): boolean {
    return this.active;
  }

  get stepCount(): number {
    return this.steps.length;
  }

  start(title: string): void {
    this.active = true;
    this.title = title;
    this.steps = [];
    this.segmentId = this.deps.newId();
    this.recordedAt = this.deps.now();
  }

  addStep(step: Step): void {
    if (!this.active) throw new Error("cannot capture a step before recording has started");
    this.steps.push(step);
  }

  addNavigation(url: string): void {
    this.addStep({ type: "navigate", effect: "readonly", url: redactUrl(url) });
  }

  stop(): Recording {
    if (!this.active) throw new Error("cannot stop a recording that was never started");
    this.active = false;
    return {
      title: this.title,
      steps: coalesceSteps(this.steps),
      "x-bskill": {
        version: 1,
        segment: { id: this.segmentId, parentSkill: null, recordedAt: this.recordedAt },
      },
    };
  }
}
