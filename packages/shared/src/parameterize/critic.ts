import type { Recording } from "../schema";
import type { LlmBackend, SchemaSpec } from "../llm/backend";
import { PREAMBLE, isRecord, stepsJson, type ParamDef } from "../distill/passes";
import { summarizeSteps } from "../distill/sanitize";

export interface Critique {
  removals: { name: string; reason: string }[];
  additions: ParamDef[];
  typeFixes: { name: string; type?: string; required?: boolean }[];
}

function paramsJson(params: ParamDef[]): string {
  return JSON.stringify(params, null, 2);
}

// ── Critique ─────────────────────────────────────────────────────────────

const critiqueSpec: SchemaSpec<Critique> = {
  jsonSchema: { type: "object", required: ["removals", "additions", "typeFixes"] },
  validate(value): string[] {
    if (!isRecord(value)) return ["expected an object"];
    const errors: string[] = [];

    if (!Array.isArray(value.removals)) {
      errors.push("removals must be an array");
    } else {
      value.removals.forEach((r, i) => {
        if (!isRecord(r)) return errors.push(`removals[${i}] must be an object`);
        if (typeof r.name !== "string" || r.name.trim() === "") errors.push(`removals[${i}].name must be a non-empty string`);
        if (typeof r.reason !== "string" || r.reason.trim() === "")
          errors.push(`removals[${i}].reason must be a non-empty string`);
      });
    }

    if (!Array.isArray(value.additions)) {
      errors.push("additions must be an array");
    } else {
      value.additions.forEach((p, i) => {
        if (!isRecord(p)) return errors.push(`additions[${i}] must be an object`);
        if (typeof p.name !== "string") errors.push(`additions[${i}].name must be a string`);
        if (typeof p.type !== "string") errors.push(`additions[${i}].type must be a string`);
        if (typeof p.required !== "boolean") errors.push(`additions[${i}].required must be a boolean`);
        if (typeof p.demoValue !== "string") errors.push(`additions[${i}].demoValue must be a string`);
      });
    }

    if (!Array.isArray(value.typeFixes)) {
      errors.push("typeFixes must be an array");
    } else {
      value.typeFixes.forEach((f, i) => {
        if (!isRecord(f)) return errors.push(`typeFixes[${i}] must be an object`);
        if (typeof f.name !== "string" || f.name.trim() === "") errors.push(`typeFixes[${i}].name must be a non-empty string`);
        if (f.type !== undefined && typeof f.type !== "string") errors.push(`typeFixes[${i}].type must be a string`);
        if (f.required !== undefined && typeof f.required !== "boolean")
          errors.push(`typeFixes[${i}].required must be a boolean`);
      });
    }

    return errors;
  },
};

export function inferParamCritique(
  recording: Recording,
  proposal: ParamDef[],
  backend: LlmBackend,
): Promise<Critique> {
  const prompt = [
    PREAMBLE,
    "TASK: critique parameters",
    "Another pass proposed the parameter list below for this browser task recording. Adversarially",
    "challenge that proposal — do not rubber-stamp it. Look for:",
    "1. MISSED inputs: a value in the steps that looks like a constant but is actually task-specific",
    "   (e.g. an account id, org slug, or record number that would change on a different run).",
    "2. OVER-parameterization: a proposed parameter whose value is actually fixed by the UI/task and",
    "   should never vary (e.g. a button label, a fixed status, or a demo-only artifact of this recording).",
    "3. WRONG type or required: a parameter whose declared type does not match its demoValue, or whose",
    "   required flag is wrong (e.g. a value that has a sensible default should not be required).",
    "Proposed parameters:",
    paramsJson(proposal),
    "Steps:",
    stepsJson(summarizeSteps(recording)),
    'Return JSON: { "removals": [ { "name", "reason" } ], ' +
      '"additions": [ { "name", "type", "required", "demoValue", "description" } ], ' +
      '"typeFixes": [ { "name", "type", "required" } ] }',
  ].join("\n");
  return backend.complete(prompt, critiqueSpec);
}
