import type { Recording } from "./schema";

/**
 * Thrown when a v1 consumer meets a recording it cannot handle single-segment.
 * A distinct type so callers can catch it and print setup guidance instead of
 * a raw stack trace.
 */
export class MultiSegmentError extends Error {
  constructor(cause: string) {
    super(
      `This recording was made with a newer skillwright (${cause}). ` +
        `This version supports single-segment recordings only and will not ` +
        `silently drop segments. Upgrade skillwright or re-record the task.`,
    );
    this.name = "MultiSegmentError";
  }
}

/**
 * Guard every v1 consumer (distill, run, write-back, evals) runs before
 * touching a recording. Errors loudly on any multi-segment shape; never
 * drops segments silently.
 */
export function assertSingleSegment(recording: Recording): void {
  const ns = recording["x-skillwright"] as { segments?: unknown };
  if (Array.isArray(ns.segments)) {
    throw new MultiSegmentError("it carries an explicit segments[] list");
  }
  if (recording["x-skillwright"].segment.parentSkill !== null) {
    throw new MultiSegmentError("it attaches to an existing skill as a later segment");
  }
}
