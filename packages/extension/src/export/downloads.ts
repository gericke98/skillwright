/**
 * Tier-0 export fallback: save the skill through `chrome.downloads` when the
 * File System Access path is unavailable (picker cancelled, permission
 * denied). Lands in the browser's download folder under
 * `skillwright/<slug>/…` — always works, but the user has to move it into
 * their skill library themselves.
 */
import type { SkillDirectory } from "@skillwright/shared";

export function downloadSkill(skill: SkillDirectory): void {
  for (const [path, content] of Object.entries(skill.files)) {
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    chrome.downloads.download({ url, filename: `skillwright/${skill.slug}/${path}` }, () => {
      URL.revokeObjectURL(url);
    });
  }
}
