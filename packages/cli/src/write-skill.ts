import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SkillDirectory } from "./distill";

/**
 * Write a distilled skill directory under `baseDir/<slug>/`, creating nested
 * directories (scripts/, references/, assets/) as needed. Returns the skill
 * directory path.
 */
export function writeSkillDirectory(skill: SkillDirectory, baseDir: string): string {
  const dir = join(baseDir, skill.slug);
  for (const [rel, contents] of Object.entries(skill.files)) {
    const target = join(dir, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents, "utf8");
  }
  return dir;
}
