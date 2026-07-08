import { describe, expect, test } from "vitest";
import type { Recording } from "@bskill/shared";
import type { SkillDirectory } from "bskill";
import { runEvals, type FixtureCase } from "../src/runner";

function recording(steps: Recording["steps"]): Recording {
  return {
    title: "Demo",
    steps,
    "x-bskill": {
      version: 1,
      segment: { id: "seg-1", parentSkill: null, recordedAt: "2026-07-07T00:00:00.000Z" },
    },
  };
}

const cleanFixture: FixtureCase = {
  name: "clean",
  recording: recording([{ type: "click", selectors: [["aria/View"]] }]),
  expectations: {
    requiredParams: [],
    destructiveStepIndices: [],
    secrets: [],
    frontmatterKeys: ["name", "description"],
  },
};

const leakyFixture: FixtureCase = {
  name: "leaky",
  recording: recording([{ type: "navigate" }]),
  expectations: {
    requiredParams: [],
    destructiveStepIndices: [],
    secrets: ["sk-live-LEAK"],
    frontmatterKeys: ["name", "description"],
  },
};

/** A distiller that always emits a passing skill directory. */
const passingDistiller = (): SkillDirectory => ({
  slug: "demo",
  files: {
    "SKILL.md": "---\nname: demo\ndescription: A demo.\n---\n# Demo\n",
    "scripts/replay.ts": "export const steps = [] as const;\n",
    "references/walkthrough.md": "# Demo\n",
    "assets/recording.json": "{}",
  },
});

describe("runEvals", () => {
  test("passes overall when every fixture passes its hard gates", async () => {
    const report = await runEvals(passingDistiller, [cleanFixture]);
    expect(report.pass).toBe(true);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]!.name).toBe("clean");
  });

  test("fails overall when any fixture leaks a secret", async () => {
    // Distiller that echoes the secret into an output file.
    const leaking = (): SkillDirectory => ({
      slug: "demo",
      files: {
        "SKILL.md": "---\nname: demo\ndescription: A demo.\n---\n# Demo\n",
        "scripts/replay.ts": "export const steps = [] as const;\n",
        "references/walkthrough.md": "# Demo\n",
        "assets/recording.json": '{"t":"sk-live-LEAK"}',
      },
    });
    const report = await runEvals(leaking, [cleanFixture, leakyFixture]);
    expect(report.pass).toBe(false);
    const leaky = report.results.find((r) => r.name === "leaky")!;
    expect(leaky.score.hardGates.secretNonLeakage.pass).toBe(false);
  });

  test("awaits async distillers", async () => {
    const asyncDistiller = async (): Promise<SkillDirectory> => passingDistiller();
    const report = await runEvals(asyncDistiller, [cleanFixture]);
    expect(report.pass).toBe(true);
  });

  test("renders a human-readable table naming each fixture", async () => {
    const report = await runEvals(passingDistiller, [cleanFixture]);
    expect(report.table).toContain("clean");
  });
});
