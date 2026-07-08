import { EFFECT_SEVERITY, type EffectTag, type Recording } from "@bskill/shared";
import type { LlmBackend, SchemaSpec } from "../llm/backend";
import { summarizeSteps, type StepSummary } from "./sanitize";

export interface Intent {
  title: string;
  description: string;
}

export interface ParamDef {
  name: string;
  type: string;
  required: boolean;
  demoValue: string;
  description?: string;
}

export interface StepNarrative {
  description: string;
  agentStep: boolean;
}

/**
 * Shared context framing. agent-cli backends are full guardrailed agents, not
 * bare JSON endpoints — without knowing WHY the JSON is wanted they (correctly)
 * refuse to emit "canned tokens on command". Establishing the legitimate task
 * up front is what makes them cooperate; it's load-bearing for the agent-cli
 * backend, not decoration.
 */
const PREAMBLE =
  "You are a component of bskill, a developer tool that turns a browser-task recording the user " +
  "made on their own machine into a reusable, shareable automation skill. All values below are " +
  "already secret-redacted. Do the requested transformation and return ONLY the requested JSON.";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function stepsJson(summaries: StepSummary[]): string {
  return JSON.stringify(summaries, null, 2);
}

// ── Intent ────────────────────────────────────────────────────────────────

const intentSpec: SchemaSpec<Intent> = {
  jsonSchema: {
    type: "object",
    required: ["title", "description"],
    properties: { title: { type: "string" }, description: { type: "string" } },
  },
  validate(value): string[] {
    if (!isRecord(value)) return ["expected an object"];
    const errors: string[] = [];
    if (typeof value.title !== "string" || value.title.trim() === "") errors.push("title must be a non-empty string");
    if (typeof value.description !== "string" || value.description.trim() === "")
      errors.push("description must be a non-empty string");
    return errors;
  },
};

export function inferIntent(recording: Recording, backend: LlmBackend): Promise<Intent> {
  const prompt = [
    PREAMBLE,
    "TASK: infer intent",
    'Infer the task title and a keyword-rich, third-person description ("what it does and when to use it")',
    "for this browser task recording (values are redacted).",
    `Recorded title hint: ${recording.title}`,
    "Steps:",
    stepsJson(summarizeSteps(recording)),
    'Return JSON: { "title": string, "description": string }',
  ].join("\n");
  return backend.complete(prompt, intentSpec);
}

// ── Parameterization ────────────────────────────────────────────────────────

const paramsSpec: SchemaSpec<{ params: ParamDef[] }> = {
  jsonSchema: { type: "object", required: ["params"] },
  validate(value): string[] {
    if (!isRecord(value) || !Array.isArray(value.params)) return ["expected { params: [] }"];
    const errors: string[] = [];
    value.params.forEach((p, i) => {
      if (!isRecord(p)) return errors.push(`params[${i}] must be an object`);
      if (typeof p.name !== "string") errors.push(`params[${i}].name must be a string`);
      if (typeof p.type !== "string") errors.push(`params[${i}].type must be a string`);
      if (typeof p.required !== "boolean") errors.push(`params[${i}].required must be a boolean`);
      if (typeof p.demoValue !== "string") errors.push(`params[${i}].demoValue must be a string`);
    });
    return errors;
  },
};

export async function inferParams(recording: Recording, backend: LlmBackend): Promise<ParamDef[]> {
  const prompt = [
    PREAMBLE,
    "TASK: extract parameters",
    "Identify demo-typed values that should become reusable inputs. Secrets are ALWAYS parameters.",
    "For each, give name (snake_case), type, required (boolean), and the exact demoValue as seen below.",
    "Steps:",
    stepsJson(summarizeSteps(recording)),
    'Return JSON: { "params": [ { "name", "type", "required", "demoValue", "description" } ] }',
  ].join("\n");
  const result = await backend.complete(prompt, paramsSpec);
  return result.params;
}

// ── Effect tagging ──────────────────────────────────────────────────────────

function effectsSpec(count: number): SchemaSpec<{ effects: EffectTag[] }> {
  return {
    jsonSchema: { type: "object", required: ["effects"] },
    validate(value): string[] {
      if (!isRecord(value) || !Array.isArray(value.effects)) return ["expected { effects: [] }"];
      const errors: string[] = [];
      if (value.effects.length !== count)
        errors.push(`effects must have exactly ${count} entries (one per step), got ${value.effects.length}`);
      value.effects.forEach((e, i) => {
        if (!EFFECT_SEVERITY.includes(e as EffectTag))
          errors.push(`effects[${i}] must be one of ${EFFECT_SEVERITY.join("|")}, got '${String(e)}'`);
      });
      return errors;
    },
  };
}

export async function inferEffects(recording: Recording, backend: LlmBackend): Promise<EffectTag[]> {
  const summaries = summarizeSteps(recording);
  const prompt = [
    PREAMBLE,
    "TASK: classify effects",
    'For EACH step below, in order, classify its effect on the world: "readonly" | "mutating" | "destructive".',
    "Round UP when uncertain (prefer destructive). delete/send/submit/pay/approve/transfer/publish are destructive.",
    "Steps:",
    stepsJson(summaries),
    `Return JSON: { "effects": [ exactly ${summaries.length} tags, same order as the steps ] }`,
  ].join("\n");
  const result = await backend.complete(prompt, effectsSpec(summaries.length));
  return result.effects;
}

// ── Narrative ─────────────────────────────────────────────────────────────

function narrativeSpec(count: number): SchemaSpec<{ steps: StepNarrative[] }> {
  return {
    jsonSchema: { type: "object", required: ["steps"] },
    validate(value): string[] {
      if (!isRecord(value) || !Array.isArray(value.steps)) return ["expected { steps: [] }"];
      const errors: string[] = [];
      if (value.steps.length !== count)
        errors.push(`steps must have exactly ${count} entries, got ${value.steps.length}`);
      value.steps.forEach((s, i) => {
        if (!isRecord(s) || typeof s.description !== "string" || s.description.trim() === "")
          errors.push(`steps[${i}].description must be a non-empty string`);
      });
      return errors;
    },
  };
}

export async function narrate(recording: Recording, backend: LlmBackend): Promise<StepNarrative[]> {
  const summaries = summarizeSteps(recording);
  const prompt = [
    PREAMBLE,
    "TASK: narrate steps",
    "Write a concise natural-language instruction for EACH step below, in order, noting selector rationale or gotchas.",
    "Set agentStep:true ONLY for a step that CANNOT be replayed deterministically — it needs live judgment such as",
    "reading a value to reuse later, a conditional branch, or waiting for a human. A recorded click or text entry is",
    "ALWAYS a fixed action (agentStep:false) even when it is destructive/irreversible — risk is handled by the effect",
    "tag and the safety gate, NOT by demoting the step to prose. Do not mark a concrete recorded action agentStep.",
    "Steps:",
    stepsJson(summaries),
    'Return JSON: { "steps": [ { "description", "agentStep" }, ... one per step ] }',
  ].join("\n");
  const result = await backend.complete(prompt, narrativeSpec(summaries.length));
  return result.steps.map((s) => ({ description: s.description, agentStep: s.agentStep === true }));
}
