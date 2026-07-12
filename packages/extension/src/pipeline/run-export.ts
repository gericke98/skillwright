/**
 * Orchestrates the tiered export: Tier 1 writes into the user's skill folder
 * via File System Access (persisted handle when possible), Tier 0 falls back
 * to chrome.downloads. Mirrors run-distill.ts: pure orchestration over
 * injected deps, unit-testable without a browser, never throws.
 */
import type { SkillDirectory } from "@skillwright/shared";

export interface ExportDeps {
  /** Persisted-handle recovery; `undefined` = no usable handle (fall through to pick). */
  restore(): Promise<FileSystemDirectoryHandle | undefined>;
  /** Directory picker; throws `AbortError` (DOMException.name) when the user cancels. */
  pick(): Promise<FileSystemDirectoryHandle>;
  /** Tier-1 writer; throws on filesystem errors (possibly mid-write). */
  save(skill: SkillDirectory, handle: FileSystemDirectoryHandle): Promise<void>;
  /** Tier-0 fallback into the browser's download folder; fire-and-forget. */
  download(skill: SkillDirectory): void;
}

export type ExportOutcome =
  /** Written into the user's skill folder (Tier 1). */
  | { tier: "folder" }
  /** Fell back to the downloads folder (Tier 0); `reason` is shown to the user. */
  | { tier: "download"; reason: string };

/** A cancelled `showDirectoryPicker` — the one "the user said no" signal. */
function isAbort(err: unknown): boolean {
  return err instanceof DOMException ? err.name === "AbortError" : (err as { name?: string })?.name === "AbortError";
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Export policy — every Tier-1 failure degrades to Tier 0 rather than
 * stranding the user with nothing:
 *
 *  - No usable persisted handle -> open the picker.
 *  - Picker cancelled / permission denied (AbortError, NotAllowedError) ->
 *    download. The user declined the FOLDER, not the export; the click that
 *    got us here was an explicit "save this skill".
 *  - `save()` throws (quota, disk error, folder deleted since last export) ->
 *    download. `saveSkillToFolder` writes file-by-file, so a mid-write failure
 *    can leave a PARTIAL skill in the folder; the downloaded copy is the
 *    user's guaranteed-complete artifact. Chosen over reporting a bare
 *    failure: a partial skill directory that silently doesn't load is worse
 *    than a duplicate the user can delete.
 *  - No retry through a fresh `pick()` after a save failure: a second picker
 *    appearing on its own (outside a user gesture) is both confusing and
 *    blocked by Chrome's transient-activation requirement.
 *
 * Never throws: the return value is the whole outcome.
 */
export async function runExport(skill: SkillDirectory, deps: ExportDeps): Promise<ExportOutcome> {
  let handle: FileSystemDirectoryHandle;
  try {
    handle = (await deps.restore()) ?? (await deps.pick());
  } catch (err) {
    deps.download(skill);
    return {
      tier: "download",
      reason: isAbort(err)
        ? "No folder chosen — saved to your downloads folder instead."
        : `Could not open the skill folder (${messageOf(err)}) — saved to your downloads folder instead.`,
    };
  }

  try {
    await deps.save(skill, handle);
    return { tier: "folder" };
  } catch (err) {
    deps.download(skill);
    return {
      tier: "download",
      reason: `Could not write to the skill folder (${messageOf(err)}) — saved a complete copy to your downloads folder instead.`,
    };
  }
}
