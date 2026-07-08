import { extractFirstJson } from "./extract";

/**
 * A schema the distiller wants an LLM to satisfy. `jsonSchema` is embedded in
 * the prompt (and drives native structured output on the api backend);
 * `validate` returns human-readable errors (empty array = valid) that feed the
 * schema-repair reprompt.
 */
export interface SchemaSpec<T> {
  jsonSchema: unknown;
  validate(value: unknown): string[];
}

/**
 * The single interface every LLM backend implements (§6.3). One call in,
 * one validated object out — the repair loop and extraction live below the
 * interface so callers never see raw text.
 */
export interface LlmBackend {
  readonly name: string;
  complete<T>(prompt: string, schema: SchemaSpec<T>): Promise<T>;
}

/** Thrown when the retry budget is spent without a schema-valid response (§8). */
export class SchemaExhaustedError extends Error {
  constructor(
    readonly attempts: number,
    readonly lastErrors: string[],
    readonly lastRaw: string,
  ) {
    super(
      `LLM output failed schema validation after ${attempts} attempt(s): ${lastErrors.join("; ")}`,
    );
    this.name = "SchemaExhaustedError";
  }
}

function repairPrompt(basePrompt: string, lastRaw: string, errors: string[]): string {
  return [
    basePrompt,
    "",
    "Your previous response did not satisfy the required schema.",
    "Previous response:",
    lastRaw,
    "",
    "Validation errors:",
    ...errors.map((e) => `- ${e}`),
    "",
    "Respond again with ONLY a single JSON value matching the schema. No prose, no code fences.",
  ].join("\n");
}

/**
 * Run `generate` up to `maxAttempts` times, extracting and validating JSON each
 * round and reprompting with the validation errors on failure. Text-mode CLI
 * backends pass a higher budget (3) than the api backend (1) because free-text
 * structure is inherently less reliable (§6.3). Throws SchemaExhaustedError if
 * no attempt validates.
 */
export async function completeWithRepair<T>(
  generate: (prompt: string) => Promise<string>,
  basePrompt: string,
  schema: SchemaSpec<T>,
  maxAttempts: number,
): Promise<T> {
  let prompt = basePrompt;
  let lastRaw = "";
  let lastErrors: string[] = ["no attempts were made"];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastRaw = await generate(prompt);
    const parsed = extractFirstJson(lastRaw);
    if (parsed === undefined) {
      lastErrors = ["response contained no parseable JSON value"];
    } else {
      const errors = schema.validate(parsed);
      if (errors.length === 0) return parsed as T;
      lastErrors = errors;
    }
    prompt = repairPrompt(basePrompt, lastRaw, lastErrors);
  }
  throw new SchemaExhaustedError(maxAttempts, lastErrors, lastRaw);
}
