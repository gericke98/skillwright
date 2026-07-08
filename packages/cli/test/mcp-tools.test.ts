import { describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseSkillMeta, skillToInputSchema, listSkillTools } from "../src/mcp/skill-tools";

const SKILL_MD = `---
name: approve-invoice
description: Approves a pending invoice in Acme Billing by invoice number.
compatibility: Requires a relay.
metadata:
  version: "1.0"
  skillwright-inputs: '[{"name":"invoice_number","type":"string","required":true},{"name":"note","type":"string","required":false}]'
---
# Approve an invoice
`;

describe("parseSkillMeta", () => {
  test("extracts name, description, and typed inputs from frontmatter", () => {
    const meta = parseSkillMeta(SKILL_MD);
    expect(meta.name).toBe("approve-invoice");
    expect(meta.description).toContain("Approves a pending invoice");
    expect(meta.inputs).toEqual([
      { name: "invoice_number", type: "string", required: true },
      { name: "note", type: "string", required: false },
    ]);
  });

  test("degrades gracefully when inputs are absent", () => {
    const md = "---\nname: x\ndescription: y\n---\n# X\n";
    const meta = parseSkillMeta(md);
    expect(meta.name).toBe("x");
    expect(meta.inputs).toEqual([]);
  });

  test("tolerates malformed skillwright-inputs JSON (no throw, empty inputs)", () => {
    const md = "---\nname: x\ndescription: y\nmetadata:\n  skillwright-inputs: 'not json'\n---\n";
    expect(parseSkillMeta(md).inputs).toEqual([]);
  });
});

describe("skillToInputSchema", () => {
  test("builds a JSON Schema with required vs optional inputs", () => {
    const schema = skillToInputSchema([
      { name: "invoice_number", type: "string", required: true },
      { name: "note", type: "string", required: false },
    ]);
    expect(schema).toEqual({
      type: "object",
      properties: {
        invoice_number: { type: "string" },
        note: { type: "string" },
      },
      required: ["invoice_number"],
    });
  });

  test("no inputs → an object schema with no required fields", () => {
    expect(skillToInputSchema([])).toEqual({ type: "object", properties: {}, required: [] });
  });
});

describe("listSkillTools", () => {
  test("maps each installed skill to an MCP tool definition", () => {
    const lib = mkdtempSync(join(tmpdir(), "sw-mcp-"));
    mkdirSync(join(lib, "approve-invoice"), { recursive: true });
    writeFileSync(join(lib, "approve-invoice", "SKILL.md"), SKILL_MD);
    mkdirSync(join(lib, "delete-invoice"), { recursive: true });
    writeFileSync(
      join(lib, "delete-invoice", "SKILL.md"),
      "---\nname: delete-invoice\ndescription: Deletes an invoice.\n---\n",
    );

    const tools = listSkillTools(lib).sort((a, b) => a.name.localeCompare(b.name));
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({
      name: "approve-invoice",
      description: expect.stringContaining("Approves"),
      inputSchema: { type: "object", required: ["invoice_number"] },
    });
    expect(tools[1]!.name).toBe("delete-invoice");
  });
});
