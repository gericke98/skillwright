import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defaultLibraryDir } from "../paths";

export interface SkillInput {
  name: string;
  type: string;
  required: boolean;
}

export interface SkillMeta {
  name: string;
  description: string;
  inputs: SkillInput[];
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string }>;
    required: string[];
  };
}

function frontmatter(skillMd: string): string {
  const m = skillMd.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1]! : "";
}

function parseInputs(block: string): SkillInput[] {
  const m = block.match(/skillwright-inputs:\s*'([\s\S]*?)'/);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[1]!);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
      .map((p) => ({
        name: String(p.name ?? ""),
        type: typeof p.type === "string" ? p.type : "string",
        required: p.required === true,
      }))
      .filter((p) => p.name !== "");
  } catch {
    return [];
  }
}

/** Read a skill's identity + typed inputs off its SKILL.md frontmatter. */
export function parseSkillMeta(skillMd: string): SkillMeta {
  const block = frontmatter(skillMd);
  return {
    name: (block.match(/^name:\s*(.+)$/m)?.[1] ?? "").trim(),
    description: (block.match(/^description:\s*(.+)$/m)?.[1] ?? "").trim(),
    inputs: parseInputs(block),
  };
}

/** JSON Schema for a skill's inputs — the MCP tool's `inputSchema`. */
export function skillToInputSchema(inputs: SkillInput[]): McpTool["inputSchema"] {
  const properties: Record<string, { type: string }> = {};
  const required: string[] = [];
  for (const input of inputs) {
    properties[input.name] = { type: input.type };
    if (input.required) required.push(input.name);
  }
  return { type: "object", properties, required };
}

/**
 * Map every installed skill in the library to an MCP tool definition. Skills
 * without a readable SKILL.md or a name are skipped. This is what lets any MCP
 * client (Claude, OpenAI, Cursor, …) discover and call skillwright skills as tools.
 */
export function listSkillTools(libraryDir = defaultLibraryDir()): McpTool[] {
  if (!existsSync(libraryDir)) return [];
  const tools: McpTool[] = [];
  for (const entry of readdirSync(libraryDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const skillMd = join(libraryDir, entry.name, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    const meta = parseSkillMeta(readFileSync(skillMd, "utf8"));
    if (!meta.name) continue;
    tools.push({
      name: meta.name,
      description: meta.description,
      inputSchema: skillToInputSchema(meta.inputs),
    });
  }
  return tools;
}
