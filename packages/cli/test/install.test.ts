import { describe, expect, test } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  lstatSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installSkill, listSkills, syncInstalls } from "../src/install";

/** A library dir containing one skill, plus an isolated project dir. */
function setup(slug = "delete-invoice"): { lib: string; project: string } {
  const lib = mkdtempSync(join(tmpdir(), "bskill-lib-"));
  const skill = join(lib, slug);
  mkdirSync(join(skill, "references"), { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "---\nname: " + slug + "\ndescription: d\n---\n# " + slug + "\n");
  writeFileSync(join(skill, "references", "walkthrough.md"), "walk v1\n");
  const project = mkdtempSync(join(tmpdir(), "bskill-proj-"));
  return { lib, project };
}

describe("bskill install (§6.4)", () => {
  test("installs into both .claude/skills and .agents/skills, resolving to the library skill", () => {
    const { lib, project } = setup();
    const result = installSkill("delete-invoice", { scope: "project", projectDir: project, libraryDir: lib });

    const claude = join(project, ".claude", "skills", "delete-invoice", "SKILL.md");
    const agents = join(project, ".agents", "skills", "delete-invoice", "SKILL.md");
    expect(readFileSync(claude, "utf8")).toContain("name: delete-invoice");
    expect(readFileSync(agents, "utf8")).toContain("name: delete-invoice");
    expect(result.locations).toHaveLength(2);
  });

  test("prefers a symlink when the platform allows it", () => {
    const { lib, project } = setup();
    installSkill("delete-invoice", { scope: "project", projectDir: project, libraryDir: lib });
    const dest = join(project, ".claude", "skills", "delete-invoice");
    expect(lstatSync(dest).isSymbolicLink()).toBe(true);
  });

  test("falls back to a real copy when symlinking is unavailable", () => {
    const { lib, project } = setup();
    const result = installSkill("delete-invoice", {
      scope: "project",
      projectDir: project,
      libraryDir: lib,
      forceCopy: true,
    });
    const dest = join(project, ".claude", "skills", "delete-invoice");
    expect(lstatSync(dest).isSymbolicLink()).toBe(false);
    expect(result.locations.every((l) => l.mode === "copy")).toBe(true);
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toContain("delete-invoice");
  });

  test("re-installing is idempotent (replaces cleanly, no duplicate tracking)", () => {
    const { lib, project } = setup();
    installSkill("delete-invoice", { scope: "project", projectDir: project, libraryDir: lib });
    installSkill("delete-invoice", { scope: "project", projectDir: project, libraryDir: lib });
    const listing = listSkills(lib);
    const skill = listing.find((s) => s.slug === "delete-invoice")!;
    expect(skill.installs).toHaveLength(2); // one per root, not four
  });
});

describe("bskill list", () => {
  test("shows the library skill with its install locations and flags copy-mode as stale-able", () => {
    const { lib, project } = setup();
    installSkill("delete-invoice", {
      scope: "project",
      projectDir: project,
      libraryDir: lib,
      forceCopy: true,
    });
    const listing = listSkills(lib);
    const skill = listing.find((s) => s.slug === "delete-invoice")!;
    expect(skill.installs.length).toBeGreaterThan(0);
    expect(skill.installs.every((i) => i.mode === "copy" && i.staleable)).toBe(true);
  });
});

describe("bskill sync", () => {
  test("refreshes a copy-mode install after the library changes; symlinks need no sync", () => {
    const { lib, project } = setup();
    installSkill("delete-invoice", {
      scope: "project",
      projectDir: project,
      libraryDir: lib,
      forceCopy: true,
    });
    // library changes (e.g. a promotion bumped the walkthrough)
    writeFileSync(join(lib, "delete-invoice", "references", "walkthrough.md"), "walk v2\n");
    const copyPath = join(project, ".claude", "skills", "delete-invoice", "references", "walkthrough.md");
    expect(readFileSync(copyPath, "utf8")).toBe("walk v1\n"); // stale before sync

    const refreshed = syncInstalls(lib);
    expect(refreshed).toBeGreaterThan(0);
    expect(readFileSync(copyPath, "utf8")).toBe("walk v2\n"); // fresh after sync
  });
});
