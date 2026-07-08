import { describe, expect, test } from "vitest";
import { MultiSegmentError, type Recording } from "@skillwright/shared";
import { distill } from "../src/index";

function recording(steps: Recording["steps"], parentSkill: string | null = null): Recording {
  return {
    title: "Approve invoice",
    steps,
    "x-skillwright": {
      version: 1,
      segment: { id: "seg-1", parentSkill, recordedAt: "2026-07-06T00:00:00.000Z" },
    },
  };
}

describe("distill (zero-LLM template)", () => {
  test("refuses a multi-segment recording rather than dropping data", () => {
    const rescue = recording([{ type: "click" }], "approve-invoice");
    expect(() => distill(rescue, {})).toThrow(MultiSegmentError);
  });

  test("emits a skill directory with the core SKILL.md files", () => {
    const skill = distill(recording([{ type: "click", selectors: [["aria/Approve"]] }]), {});
    expect(Object.keys(skill.files)).toEqual(
      expect.arrayContaining([
        "SKILL.md",
        "scripts/replay.ts",
        "references/walkthrough.md",
        "assets/recording.json",
      ]),
    );
  });

  test("SKILL.md frontmatter has the required core-spec fields name + description", () => {
    const skill = distill(recording([{ type: "click", selectors: [["aria/Approve"]] }]), {
      name: "approve-invoice",
    });
    const md = skill.files["SKILL.md"];
    const fm = md.match(/^---\n([\s\S]*?)\n---/);
    expect(fm).not.toBeNull();
    const block = fm![1];
    expect(block).toMatch(/^name:\s*approve-invoice\s*$/m);
    expect(block).toMatch(/^description:\s*\S+/m);
  });

  test("derives the slug from title when no name is given", () => {
    const skill = distill(recording([{ type: "click" }]), {});
    expect(skill.slug).toBe("approve-invoice");
  });

  test("tags each step's effect and surfaces it in the walkthrough", () => {
    const skill = distill(
      recording([
        { type: "click", selectors: [["aria/Delete invoice"]] },
        { type: "change", selectors: [["aria/Amount"]] },
      ]),
      {},
    );
    const wt = skill.files["references/walkthrough.md"];
    expect(wt).toMatch(/destructive/i); // the Delete step
    expect(wt).toMatch(/mutating/i); // the Amount edit
  });

  test("never inlines a secret: a {secret} placeholder stays a placeholder", () => {
    const skill = distill(
      recording([{ type: "change", selectors: [["aria/Password"]], value: "{secret}" }]),
      {},
    );
    const serialized = JSON.stringify(skill.files);
    expect(serialized).toContain("{secret}");
    expect(serialized).not.toContain("hunter2");
  });
});
