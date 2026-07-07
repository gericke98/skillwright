import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SkillDirectory } from "../src/index";
import { writeSkillDirectory } from "../src/index";

let base: string;
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "bskill-test-"));
});
afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

const skill: SkillDirectory = {
  slug: "approve-invoice",
  files: {
    "SKILL.md": "# skill",
    "scripts/replay.ts": "// replay",
    "assets/recording.json": "{}",
  },
};

describe("writeSkillDirectory", () => {
  test("writes every file under <base>/<slug>/, creating nested dirs", () => {
    const dir = writeSkillDirectory(skill, base);
    expect(dir).toBe(join(base, "approve-invoice"));
    expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toBe("# skill");
    expect(readFileSync(join(dir, "scripts/replay.ts"), "utf8")).toBe("// replay");
    expect(readFileSync(join(dir, "assets/recording.json"), "utf8")).toBe("{}");
  });
});
