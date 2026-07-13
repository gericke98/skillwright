import { distill, distillSemantic, type LlmBackend, type Recording, type SkillDirectory } from "@skillwright/shared";

export interface RunDistillResult {
  skill: SkillDirectory;
  usedLlm: boolean;
  /**
   * Provider/LLM-authored text (an error `.message`). Present only on the
   * degraded (fallback) path. NEVER log this and NEVER rebuild/enrich it
   * from config — `fetch-backend.ts` already scrubs the API key out of
   * provider error bodies before this ever sees them; propagate verbatim.
   * Rendered via `textContent` by `stage-view.ts`, never `innerHTML`.
   */
  llmError?: string;
}

/**
 * Rock-bottom, total zero-LLM distill. `distill()` itself can throw (e.g. a
 * malformed/degenerate recording that fails `assertSingleSegment`) — the
 * design doc's §8 graceful-degradation requirement is that authoring NEVER
 * hard-blocks, so this wraps it with a minimal, always-constructible
 * SkillDirectory as a last resort.
 */
function safeDistill(recording: Recording, opts: { name?: string }): SkillDirectory {
  try {
    return distill(recording, opts);
  } catch {
    const slug = opts.name?.trim() || "untitled-skill";
    return {
      slug,
      files: {
        "SKILL.md": `---\nname: ${slug}\n---\n\n# ${recording?.title || "Untitled skill"}\n\nThis recording could not be compiled automatically.\n`,
      },
    };
  }
}

/**
 * Orchestrates the extension's distill stage. Prefers the LLM-backed
 * semantic distiller when a backend is configured, but never hard-blocks
 * authoring on it: any failure of the LLM path — no API key, a bad key, a
 * rate limit, a network error, a malformed response, or anything else —
 * falls back to the total, zero-LLM `distill()` (design doc §8). Never
 * throws.
 */
export async function runDistill(
  recording: Recording,
  backend: LlmBackend | undefined,
  opts: { name?: string } = {},
): Promise<RunDistillResult> {
  if (backend) {
    try {
      const skill = await distillSemantic(recording, backend, opts);
      return { skill, usedLlm: true };
    } catch (err) {
      const llmError = err instanceof Error ? err.message : String(err);
      return { skill: safeDistill(recording, opts), usedLlm: false, llmError };
    }
  }
  return { skill: safeDistill(recording, opts), usedLlm: false };
}
