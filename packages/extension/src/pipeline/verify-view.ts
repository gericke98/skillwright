/**
 * Verify-stage view: replay the compiled skill against the live tab so the user
 * sees it work before trusting it. Pure DOM; the run itself happens in the
 * background worker (only it holds chrome.debugger).
 *
 * Verify is OPTIONAL — the skill is already exported by the time we get here.
 * Nothing in this view blocks or gates.
 */
import type { VerifyResult } from "../verify/runner";

export interface VerifyViewHooks {
  onVerify(opts: { confirmDestructive: boolean }): void;
}

export function renderVerify(container: HTMLElement, hooks: VerifyViewHooks): void {
  container.innerHTML = "";

  const warning = document.createElement("p");
  warning.className = "stage-notice";
  // Chrome shows a "being debugged" infobar the moment we attach. Users who
  // aren't warned read it as the extension breaking their browser.
  warning.textContent =
    "Verify replays the skill in your current tab. Chrome will show a “being debugged” banner while it runs, and the steps really happen on the page.";
  container.appendChild(warning);

  const destructive = document.createElement("label");
  const destructiveBox = document.createElement("input");
  destructiveBox.type = "checkbox";
  destructiveBox.id = "verify-confirm-destructive";
  destructive.appendChild(destructiveBox);
  destructive.appendChild(
    document.createTextNode(" Also run destructive steps (deletes, sends — these are skipped by default)"),
  );
  container.appendChild(destructive);

  const button = document.createElement("button");
  button.id = "verify-run";
  button.textContent = "Verify skill in this tab";
  button.addEventListener("click", () => hooks.onVerify({ confirmDestructive: destructiveBox.checked }));
  container.appendChild(button);

  const results = document.createElement("div");
  results.id = "verify-results";
  container.appendChild(results);
}

/** Render the per-step outcomes (or a run-level error). All text, never markup. */
export function renderVerifyResults(
  container: HTMLElement,
  results: VerifyResult[],
  error?: string,
): void {
  const target = container.querySelector<HTMLDivElement>("#verify-results");
  if (!target) return;
  target.innerHTML = "";

  if (error) {
    const p = document.createElement("p");
    p.className = "stage-error";
    p.textContent = error;
    target.appendChild(p);
    return;
  }

  const failed = results.find((r) => r.outcome === "fail");
  const summary = document.createElement("p");
  summary.className = failed ? "stage-error" : "stage-notice";
  const ok = results.filter((r) => r.outcome === "ok").length;
  const skipped = results.filter((r) => r.outcome === "skipped-destructive").length;
  summary.textContent = failed
    ? `Failed: ${failed.error ?? "step failed"}`
    : `Verified ${ok} step${ok === 1 ? "" : "s"}` +
      (skipped > 0 ? `, skipped ${skipped} destructive step${skipped === 1 ? "" : "s"}.` : ".");
  target.appendChild(summary);

  const list = document.createElement("ul");
  list.className = "verify-list";
  for (const r of results) {
    const li = document.createElement("li");
    li.className = `verify-${r.outcome}`;
    const mark = r.outcome === "ok" ? "✓" : r.outcome === "fail" ? "✗" : "–";
    li.textContent = `${mark} step ${r.index + 1}${r.outcome === "skipped-destructive" ? " (destructive, skipped)" : ""}`;
    list.appendChild(li);
  }
  target.appendChild(list);
}
