import { describe, expect, test } from "vitest";
import type { SkillDirectory } from "skillwright";
import { scoreFixture, type Expectations } from "../src/rubric";

/**
 * Build a recording.json body the scorer reads effect tags out of. This is the
 * source of truth: it keeps EVERY step at its original index (unlike replay.ts,
 * which drops agent-judgment steps and re-indexes), so destructiveStepIndices
 * line up even when a step is emitted as agent prose.
 */
function recordingJson(steps: Array<{ type: string; effect: string }>): string {
  return JSON.stringify({
    title: "Demo",
    steps: steps.map((s) => ({ ...s, selectors: [] })),
    "x-skillwright": { version: 1, segment: { id: "s", parentSkill: null, recordedAt: "2026" } },
  });
}

function skill(files: Partial<Record<string, string>>): SkillDirectory {
  return {
    slug: "demo",
    files: {
      "SKILL.md": "---\nname: demo\ndescription: A demo skill.\n---\n# Demo\n",
      "scripts/replay.ts": "export const steps = [] as const;\n",
      "references/walkthrough.md": "# Demo\n",
      "assets/recording.json": recordingJson([{ type: "click", effect: "mutating" }]),
      ...files,
    },
  };
}

const baseExpectations: Expectations = {
  requiredParams: [],
  destructiveStepIndices: [],
  secrets: [],
  frontmatterKeys: ["name", "description"],
};

describe("scoreFixture — secret non-leakage (hard gate)", () => {
  test("flags a secret that survives in any output file", () => {
    const produced = skill({
      "assets/recording.json": '{"token":"sk-live-abc123DEADBEEF"}',
    });
    const score = scoreFixture(produced, {
      ...baseExpectations,
      secrets: ["sk-live-abc123DEADBEEF"],
    });
    expect(score.hardGates.secretNonLeakage.leaks).toContain("sk-live-abc123DEADBEEF");
    expect(score.hardGates.secretNonLeakage.pass).toBe(false);
    expect(score.pass).toBe(false);
  });

  test("passes when no secret appears in any file", () => {
    const produced = skill({ "assets/recording.json": '{"token":"{api_token}"}' });
    const score = scoreFixture(produced, {
      ...baseExpectations,
      secrets: ["sk-live-abc123DEADBEEF"],
    });
    expect(score.hardGates.secretNonLeakage.pass).toBe(true);
  });
});

describe("scoreFixture — destructive-tag recall (hard gate)", () => {
  test("recall < 1 when an expected-destructive step is under-tagged", () => {
    const produced = skill({
      "assets/recording.json": recordingJson([
        { type: "click", effect: "mutating" }, // step 0 should have been destructive
      ]),
    });
    const score = scoreFixture(produced, { ...baseExpectations, destructiveStepIndices: [0] });
    expect(score.hardGates.destructiveTagRecall.value).toBe(0);
    expect(score.hardGates.destructiveTagRecall.pass).toBe(false);
    expect(score.pass).toBe(false);
  });

  test("full recall when every expected-destructive step is tagged destructive", () => {
    const produced = skill({
      "assets/recording.json": recordingJson([
        { type: "click", effect: "destructive" },
        { type: "change", effect: "mutating" },
      ]),
    });
    const score = scoreFixture(produced, { ...baseExpectations, destructiveStepIndices: [0] });
    expect(score.hardGates.destructiveTagRecall.value).toBe(1);
    expect(score.hardGates.destructiveTagRecall.pass).toBe(true);
  });

  test("recall aligns to ORIGINAL indices even when a step is agent-excluded from replay.ts", () => {
    // Delete is step 3 in the recording but emitted as agent prose (absent from
    // replay.ts). recording.json still carries it at index 3, tagged destructive.
    const produced = skill({
      "assets/recording.json": recordingJson([
        { type: "navigate", effect: "readonly" },
        { type: "change", effect: "mutating" },
        { type: "click", effect: "mutating" },
        { type: "click", effect: "destructive" },
      ]),
      "scripts/replay.ts": "export const steps = [] as const;\n", // agent step dropped
    });
    const score = scoreFixture(produced, { ...baseExpectations, destructiveStepIndices: [3] });
    expect(score.hardGates.destructiveTagRecall.pass).toBe(true);
  });

  test("recall is vacuously 1 when no destructive steps are expected", () => {
    const score = scoreFixture(skill({}), baseExpectations);
    expect(score.hardGates.destructiveTagRecall.value).toBe(1);
    expect(score.hardGates.destructiveTagRecall.pass).toBe(true);
  });
});

describe("scoreFixture — frontmatter validity (hard gate)", () => {
  test("detects a missing required frontmatter key", () => {
    const produced = skill({ "SKILL.md": "---\nname: demo\n---\n# Demo\n" });
    const score = scoreFixture(produced, baseExpectations);
    expect(score.hardGates.frontmatterValid.missing).toContain("description");
    expect(score.hardGates.frontmatterValid.pass).toBe(false);
  });
});

describe("scoreFixture — parameter extraction (soft score)", () => {
  test("recall counts demo values promoted to declared placeholders", () => {
    const produced = skill({
      "SKILL.md":
        "---\nname: demo\ndescription: A demo.\nmetadata:\n  skillwright-inputs: '[{\"name\":\"invoice_number\"}]'\n---\n# Demo\nEnter {invoice_number}.\n",
    });
    const score = scoreFixture(produced, {
      ...baseExpectations,
      requiredParams: [{ name: "invoice_number", demoValue: "INV-1042" }],
    });
    expect(score.soft.paramExtractionRecall).toBe(1);
  });

  test("recall is 0 when the demo value is left raw and unparameterized", () => {
    const produced = skill({
      "SKILL.md": "---\nname: demo\ndescription: A demo.\n---\n# Demo\nEnter INV-1042.\n",
    });
    const score = scoreFixture(produced, {
      ...baseExpectations,
      requiredParams: [{ name: "invoice_number", demoValue: "INV-1042" }],
    });
    expect(score.soft.paramExtractionRecall).toBe(0);
  });
});

describe("scoreFixture — overall pass", () => {
  test("passes only when every hard gate passes", () => {
    const score = scoreFixture(skill({}), baseExpectations);
    expect(score.pass).toBe(true);
  });
});
