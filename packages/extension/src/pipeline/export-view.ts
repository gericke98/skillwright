/**
 * Export-stage view: a "Save to skill folder" button over the final
 * (script-stage) SkillDirectory. Pure DOM rendering — the tiered
 * FS-Access/downloads decision lives in run-export.ts; panel.ts wires the
 * two together. All text lands via `textContent` (outcome messages can echo
 * filesystem errors, which are not ours to interpret as HTML).
 */
import type { SkillDirectory } from "@skillwright/shared";

export interface ExportViewHooks {
  /** Invoked with the final SkillDirectory when the user clicks export. */
  onExport(skill: SkillDirectory): void;
}

export function renderExport(container: HTMLElement, skill: SkillDirectory, hooks: ExportViewHooks): void {
  container.innerHTML = "";

  const summary = document.createElement("p");
  summary.className = "stage-notice";
  summary.textContent = `Ready to export "${skill.slug}" (${Object.keys(skill.files).length} files).`;
  container.appendChild(summary);

  const button = document.createElement("button");
  button.id = "export-skill";
  button.textContent = "Save to skill folder";
  button.addEventListener("click", () => hooks.onExport(skill));
  container.appendChild(button);

  const status = document.createElement("p");
  status.id = "export-status";
  status.className = "stage-notice";
  container.appendChild(status);
}

/** Update the outcome line under the button (safe for provider/fs error text). */
export function renderExportStatus(container: HTMLElement, message: string): void {
  const status = container.querySelector<HTMLParagraphElement>("#export-status");
  if (status) status.textContent = message;
}
