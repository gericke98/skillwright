import { describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  recordHeal,
  loadCandidates,
  confirmClean,
  readyForPromotion,
  promote,
  PROMOTE_THRESHOLD,
} from "../src/quarantine";

const RECORDING = JSON.stringify({
  title: "Delete invoice",
  steps: [{ type: "click", effect: "destructive", selectors: [["aria/Delete"]] }],
  "x-bskill": { version: 1, segment: { id: "s", parentSkill: null, recordedAt: "2026-07-07" } },
});

function makeSkill(): string {
  const dir = mkdtempSync(join(tmpdir(), "bskill-q-"));
  writeFileSync(
    join(dir, "SKILL.md"),
    '---\nname: delete-invoice\ndescription: Deletes.\nmetadata:\n  author: bskill\n  version: "1.0"\n---\n# Delete\n',
  );
  writeFileSync(join(dir, "replay.ts"), "export const steps = [] as const;\n");
  mkdirSync(join(dir, "references"), { recursive: true });
  writeFileSync(join(dir, "references", "CHANGELOG.md"), "# Changelog\n");
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "assets", "recording.json"), RECORDING);
  return dir;
}

describe("quarantine store — quarantine-before-promote (§6.2)", () => {
  test("recordHeal persists a candidate WITHOUT touching canonical files", () => {
    const dir = makeSkill();
    const skillBefore = readFileSync(join(dir, "SKILL.md"), "utf8");
    const replayBefore = readFileSync(join(dir, "replay.ts"), "utf8");

    recordHeal(dir, { stepIndex: 3, selector: "aria/Remove" });

    const cands = loadCandidates(dir);
    expect(cands).toHaveLength(1);
    expect(cands[0]).toMatchObject({ stepIndex: 3, selector: "aria/Remove", confirmations: 0 });
    // canonical files unchanged — a first-success heal is not trusted yet
    expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toBe(skillBefore);
    expect(readFileSync(join(dir, "replay.ts"), "utf8")).toBe(replayBefore);
    expect(existsSync(join(dir, "promoted-selectors.json"))).toBe(false);
  });

  test("a new heal for the same step replaces the candidate and resets confirmations", () => {
    const dir = makeSkill();
    recordHeal(dir, { stepIndex: 3, selector: "aria/Remove" });
    confirmClean(dir, [3]);
    recordHeal(dir, { stepIndex: 3, selector: "aria/Delete row" }); // different selector

    const cands = loadCandidates(dir);
    expect(cands).toHaveLength(1);
    expect(cands[0]).toMatchObject({ selector: "aria/Delete row", confirmations: 0 });
  });

  test("a first-success heal does NOT auto-promote", () => {
    const dir = makeSkill();
    recordHeal(dir, { stepIndex: 0, selector: "aria/Remove" });
    const result = promote(dir); // no force, confirmations = 0
    expect(result.promoted).toBe(0);
    expect(existsSync(join(dir, "promoted-selectors.json"))).toBe(false);
  });

  test(`promotes after ${PROMOTE_THRESHOLD} clean confirmations: overlay + version bump + changelog`, () => {
    const dir = makeSkill();
    recordHeal(dir, { stepIndex: 0, selector: "aria/Remove" });
    const recBefore = readFileSync(join(dir, "assets", "recording.json"), "utf8");

    for (let i = 0; i < PROMOTE_THRESHOLD; i++) confirmClean(dir, [0]);
    expect(readyForPromotion(dir)).toHaveLength(1);

    const result = promote(dir);
    expect(result.promoted).toBe(1);

    // promoted selector lands in the keyed overlay
    const overlay = JSON.parse(readFileSync(join(dir, "promoted-selectors.json"), "utf8"));
    expect(overlay["0"]).toBe("aria/Remove");
    // version bumped
    expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toMatch(/version:\s*"1\.1"/);
    // changelog appended
    expect(readFileSync(join(dir, "references", "CHANGELOG.md"), "utf8")).toMatch(/aria\/Remove/);
    // recording.json is immutable evidence — byte-identical
    expect(readFileSync(join(dir, "assets", "recording.json"), "utf8")).toBe(recBefore);
    // promoted candidate cleared from quarantine
    expect(loadCandidates(dir)).toHaveLength(0);
  });

  test("bskill promote --force promotes an unconfirmed candidate", () => {
    const dir = makeSkill();
    recordHeal(dir, { stepIndex: 0, selector: "aria/Remove" });
    const result = promote(dir, { force: true });
    expect(result.promoted).toBe(1);
    expect(existsSync(join(dir, "promoted-selectors.json"))).toBe(true);
  });
});
