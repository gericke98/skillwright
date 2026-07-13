import { describe, expect, test } from "vitest";
import type { SkillDirectory } from "../src/distill";
import type { FinalParam } from "../src/parameterize";
import { applyParamsToSkill } from "../src/parameterize/apply-to-skill";

const params: FinalParam[] = [
  {
    name: "username",
    type: "string",
    required: true,
    demoValue: "alice",
    rationale: "typed into the login form",
    confidence: "medium",
  },
  {
    name: "password",
    type: "string",
    required: true,
    demoValue: "",
    rationale: "secret floor",
    confidence: "high",
  },
];

/** Frontmatter shape emitted by the zero-LLM distiller: metadata block, no inputs line. */
const zeroLlmSkillMd = [
  "---",
  "name: demo",
  'description: "Demo task."',
  "compatibility: Requires Node 20+.",
  "metadata:",
  "  author: skillwright",
  '  version: "1.0"',
  "---",
  "",
  "# Demo task",
].join("\n");

/** Semantic distiller shape: an existing skillwright-inputs line to replace. */
const semanticSkillMd = [
  "---",
  "name: demo",
  'description: "Demo task."',
  "compatibility: Requires Node 20+.",
  "metadata:",
  "  author: skillwright",
  '  version: "1.0"',
  `  skillwright-inputs: '${JSON.stringify([{ name: "stale", type: "string", required: false }])}'`,
  "---",
  "",
  "# Demo task",
].join("\n");

function skillWith(skillMd: string): SkillDirectory {
  return {
    slug: "demo",
    files: {
      "SKILL.md": skillMd,
      "scripts/replay.ts": "// script",
      "assets/recording.json": "{}",
    },
  };
}

const expectedInputsLine = `  skillwright-inputs: '${JSON.stringify([
  { name: "username", type: "string", required: true },
  { name: "password", type: "string", required: true },
])}'`;

describe("applyParamsToSkill", () => {
  test("inserts skillwright-inputs into a zero-LLM metadata block (after version)", () => {
    const out = applyParamsToSkill(skillWith(zeroLlmSkillMd), params);
    const lines = out.files["SKILL.md"]!.split("\n");
    const versionAt = lines.indexOf('  version: "1.0"');
    expect(lines[versionAt + 1]).toBe(expectedInputsLine);
    // Frontmatter still closes and the body survives.
    expect(lines.filter((l) => l === "---")).toHaveLength(2);
    expect(out.files["SKILL.md"]).toContain("# Demo task");
  });

  test("replaces an existing skillwright-inputs line (semantic distiller shape)", () => {
    const out = applyParamsToSkill(skillWith(semanticSkillMd), params);
    const md = out.files["SKILL.md"]!;
    expect(md).not.toContain('"stale"');
    expect(md.split("\n")).toContain(expectedInputsLine);
    // Exactly one inputs line — replaced, not duplicated.
    expect(md.split("\n").filter((l) => l.trimStart().startsWith("skillwright-inputs:"))).toHaveLength(1);
  });

  test("passes a frontmatter-less SKILL.md through untouched (foreign artifact)", () => {
    const foreign = skillWith("# Just a heading\n\nNo frontmatter here.");
    const out = applyParamsToSkill(foreign, params);
    expect(out.files["SKILL.md"]).toBe("# Just a heading\n\nNo frontmatter here.");
  });

  test("leaves every other file byte-identical and does not mutate the input", () => {
    const input = skillWith(zeroLlmSkillMd);
    const before = JSON.stringify(input);
    const out = applyParamsToSkill(input, params);
    expect(out.files["scripts/replay.ts"]).toBe("// script");
    expect(out.files["assets/recording.json"]).toBe("{}");
    expect(JSON.stringify(input)).toBe(before);
    expect(out).not.toBe(input);
    expect(out.files).not.toBe(input.files);
  });

  test("single quotes in a param name cannot break the quoted YAML scalar", () => {
    const hostile: FinalParam[] = [
      {
        name: "it's",
        type: "string",
        required: true,
        demoValue: "",
        rationale: "",
        confidence: "low",
      },
    ];
    const out = applyParamsToSkill(skillWith(zeroLlmSkillMd), hostile);
    const line = out.files["SKILL.md"]!
      .split("\n")
      .find((l) => l.trimStart().startsWith("skillwright-inputs:"))!;
    // YAML single-quoted scalar escapes ' as '' — the line must still be one
    // well-formed scalar (odd count of bare quotes would mean a broken value).
    expect(line).toContain("''");
  });
});
