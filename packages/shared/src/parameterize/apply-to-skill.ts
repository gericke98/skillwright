import type { SkillDirectory } from "../distill";
import type { FinalParam } from "./reconcile";

/**
 * Bake approved runtime inputs into a skill's SKILL.md frontmatter as the
 * `skillwright-inputs` metadata line — the contract `skillwright run --input`
 * and the MCP facade read to know which values a replay needs.
 *
 * Pure: returns a NEW SkillDirectory; never mutates the input, never throws.
 *
 * Placement rules, in order:
 *  1. An existing `skillwright-inputs:` line inside the frontmatter is
 *     REPLACED (the semantic distiller emits a proposer-only guess; the
 *     approved set supersedes it).
 *  2. Otherwise the line is inserted inside the `metadata:` block, after its
 *     last indented entry (both distillers emit `metadata:` last, so this
 *     lands just before the closing `---`).
 *  3. A SKILL.md without well-formed frontmatter (no opening `---` pair) is a
 *     foreign artifact we didn't render — pass it through untouched rather
 *     than guess at a structure and corrupt a file we don't understand.
 *
 * Only `{name, type, required}` are published: `demoValue`/`rationale`/
 * `confidence` are review-time metadata, and a secret's demoValue is already
 * forced empty by the reconcile floor — but inputs frontmatter is consumed by
 * arbitrary agents, so values stay out of the artifact wholesale.
 */
export function applyParamsToSkill(skill: SkillDirectory, params: FinalParam[]): SkillDirectory {
  const skillMd = skill.files["SKILL.md"];
  if (typeof skillMd !== "string") return { ...skill, files: { ...skill.files } };

  const lines = skillMd.split("\n");
  const close = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  if (close === -1) return { ...skill, files: { ...skill.files } };

  const inputs = params.map((p) => ({ name: p.name, type: p.type, required: p.required }));
  // YAML single-quoted scalar: the only escape is '' for a literal quote.
  const inputsLine = `  skillwright-inputs: '${JSON.stringify(inputs).replaceAll("'", "''")}'`;

  const existing = lines.findIndex(
    (l, i) => i > 0 && i < close && l.trimStart().startsWith("skillwright-inputs:"),
  );
  const next = [...lines];
  if (existing !== -1) {
    next[existing] = inputsLine;
  } else {
    const metadataAt = lines.findIndex((l, i) => i > 0 && i < close && l === "metadata:");
    if (metadataAt === -1) return { ...skill, files: { ...skill.files } };
    let insertAt = metadataAt + 1;
    while (insertAt < close && lines[insertAt]!.startsWith("  ")) insertAt++;
    next.splice(insertAt, 0, inputsLine);
  }

  return { ...skill, files: { ...skill.files, "SKILL.md": next.join("\n") } };
}
