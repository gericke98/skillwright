import { completeWithRepair, type LlmBackend, type SchemaSpec } from "./backend";

const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";

export interface ApiOptions {
  apiKey: string;
  model?: string;
  endpoint?: string;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Native structured output is reliable, so the budget is low (default 1). */
  maxAttempts?: number;
}

interface ContentBlock {
  type: string;
  input?: unknown;
  text?: string;
}

/**
 * Direct Anthropic API backend (§6.3), opt-in via BSKILL_API_KEY. Uses a forced
 * tool call for native structured output — the tool's input_schema is the
 * distiller's schema — so JSON comes back structured, not as free text. Low
 * retry budget because native structured output rarely needs a repair round.
 */
export function createApiBackend(opts: ApiOptions): LlmBackend {
  const model = opts.model ?? DEFAULT_MODEL;
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxAttempts = opts.maxAttempts ?? 1;

  return {
    name: `api:${model}`,
    complete<T>(prompt: string, schema: SchemaSpec<T>): Promise<T> {
      const generate = async (p: string): Promise<string> => {
        const res = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": opts.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            tools: [
              {
                name: "emit",
                description: "Emit the required structured result.",
                input_schema: schema.jsonSchema,
              },
            ],
            tool_choice: { type: "tool", name: "emit" },
            messages: [{ role: "user", content: p }],
          }),
        });
        if (!res.ok) {
          throw new Error(`Anthropic API error ${res.status}`);
        }
        const data = (await res.json()) as { content?: ContentBlock[] };
        const toolUse = data.content?.find((b) => b.type === "tool_use");
        if (toolUse?.input !== undefined) return JSON.stringify(toolUse.input);
        const textBlock = data.content?.find((b) => b.type === "text");
        return textBlock?.text ?? "";
      };
      return completeWithRepair(generate, prompt, schema, maxAttempts);
    },
  };
}
