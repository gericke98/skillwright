import {
  parameterize,
  parameterizeWithoutLlm,
  type FinalParam,
  type LlmBackend,
  type Recording,
} from "@skillwright/shared";

export interface RunParameterizeResult {
  params: FinalParam[];
  usedLlm: boolean;
  /**
   * Provider/LLM-authored text (an error `.message`). Present only on the
   * degraded path. Rendered via `textContent`, never `innerHTML` — and the
   * fetch backend has already scrubbed the API key out of provider error
   * bodies before this ever sees it.
   */
  llmError?: string;
}

/**
 * Orchestrates the parameterize stage. Mirrors `runDistill`: prefers the
 * LLM (proposer → critic → reconcile) but NEVER hard-blocks authoring on it.
 *
 * No backend configured, a bad key, a rate limit, a malformed response — all
 * fall back to `parameterizeWithoutLlm`, which still applies the deterministic
 * secret floor. Losing the LLM costs you smart parameter names; it must not
 * cost you the skill, and it must not cost you the secret handling.
 *
 * This is the fix for a real dead-end: the stage used to render "configure a
 * provider" and simply stop, stranding the pipeline before export — so a user
 * without a key could never get a skill out of the panel at all.
 *
 * Never throws.
 */
export async function runParameterize(
  recording: Recording,
  backend: LlmBackend | undefined,
): Promise<RunParameterizeResult> {
  if (backend) {
    try {
      return { params: await parameterize(recording, backend), usedLlm: true };
    } catch (err) {
      const llmError = err instanceof Error ? err.message : String(err);
      return { params: safeZeroLlm(recording), usedLlm: false, llmError };
    }
  }
  return { params: safeZeroLlm(recording), usedLlm: false };
}

/** `parameterizeWithoutLlm` is pure and total, but the recording arrives over
 * chrome.runtime (untyped at the wire) — a degenerate one must not take the
 * panel down. No params is a valid outcome; a crash is not. */
function safeZeroLlm(recording: Recording): FinalParam[] {
  try {
    return parameterizeWithoutLlm(recording);
  } catch {
    return [];
  }
}
