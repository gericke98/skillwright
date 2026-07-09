import { completeWithRepair, type LlmBackend, type SchemaSpec } from "@skillwright/shared";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MAX_TOKENS = 4096;
/** Free-text extraction (no native structured output), so allow one repair round. */
const DEFAULT_MAX_ATTEMPTS = 1;
/** How much of a non-2xx response body to fold into the thrown error. */
const ERROR_BODY_TRUNCATE = 500;

export interface FetchBackendConfig {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface AnthropicContentBlock {
  type?: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
}

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.length > ERROR_BODY_TRUNCATE ? `${text.slice(0, ERROR_BODY_TRUNCATE)}...` : text;
  } catch {
    return "<unreadable body>";
  }
}

/**
 * NEVER include `cfg.apiKey` (or any header/body that might carry it) in a
 * thrown error or log line — this backend is BYO-key and the key must stay
 * inside chrome.storage.local only.
 */
function makeAnthropicGenerate(cfg: FetchBackendConfig, fetchImpl: typeof fetch) {
  return async (prompt: string): Promise<string> => {
    const res = await fetchImpl(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: DEFAULT_MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status} ${res.statusText}: ${await readErrorBody(res)}`);
    }
    const data = (await res.json()) as AnthropicResponse;
    const block = data.content?.[0];
    return typeof block?.text === "string" ? block.text : "";
  };
}

function makeOpenAiGenerate(cfg: FetchBackendConfig, fetchImpl: typeof fetch) {
  return async (prompt: string): Promise<string> => {
    const res = await fetchImpl(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI API error ${res.status} ${res.statusText}: ${await readErrorBody(res)}`);
    }
    const data = (await res.json()) as OpenAiResponse;
    const content = data.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : "";
  };
}

/**
 * BYO-key `fetch`-based LlmBackend for the extension (browser origin — no
 * Node/undici). Delegates schema validation + one repair round to
 * `completeWithRepair` from `@skillwright/shared`, same as the CLI api
 * backend, but extracts plain text (no native structured output / tool
 * calling) since both provider HTTP APIs are called directly from the page
 * without a server-side proxy.
 */
export function createFetchBackend(cfg: FetchBackendConfig): LlmBackend {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const generate =
    cfg.provider === "anthropic" ? makeAnthropicGenerate(cfg, fetchImpl) : makeOpenAiGenerate(cfg, fetchImpl);

  return {
    name: `fetch:${cfg.provider}`,
    complete<T>(prompt: string, schema: SchemaSpec<T>): Promise<T> {
      return completeWithRepair(generate, prompt, schema, DEFAULT_MAX_ATTEMPTS);
    },
  };
}
