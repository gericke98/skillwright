import { homedir } from "node:os";
import { join } from "node:path";

/** The global skill library root: `~/.skillwright/`. */
export function defaultLibraryDir(): string {
  return process.env.SKILLWRIGHT_HOME ?? join(homedir(), ".skillwright");
}
