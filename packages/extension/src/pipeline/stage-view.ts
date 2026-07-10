import type { Stage } from "./state";

const STAGES: Stage[] = ["record", "distill", "parameterize", "script", "export", "verify"];

/**
 * Renders the 6 pipeline stages as a strip, marking the current one and
 * optionally showing an error. Pure/injectable (container + data in, no
 * global/chrome API), so it's directly unit-testable — see
 * test/stage-view.test.ts.
 *
 * `error` is untrusted (it can originate from an LLM-call failure message or
 * other user-influenced text) and is set via `textContent`, never innerHTML
 * string concatenation.
 */
export function renderStages(container: HTMLElement, stage: Stage, error?: string): void {
  container.innerHTML = "";

  for (const s of STAGES) {
    const el = document.createElement("span");
    el.className = s === stage ? "stage stage-current" : "stage";
    el.textContent = s;
    container.appendChild(el);
  }

  if (error !== undefined) {
    const errEl = document.createElement("div");
    errEl.className = "stage-error";
    errEl.textContent = error;
    container.appendChild(errEl);
  }
}
