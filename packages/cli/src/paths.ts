import { homedir } from "node:os";
import { join } from "node:path";

/** The global skill library root: `~/.browser-skills/`. */
export function defaultLibraryDir(): string {
  return process.env.BSKILL_HOME ?? join(homedir(), ".browser-skills");
}
