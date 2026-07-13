const STORAGE_KEY = "llmSettings";

export type LlmProvider = "anthropic" | "openai" | "custom" | "relay";

export interface LlmSettings {
  provider: LlmProvider;
  /**
   * Empty is legitimate for `custom` (a local model needs no key) and for
   * `relay` (there IS no key — that's the point). Still required for the hosted
   * providers.
   */
  apiKey: string;
  /**
   * Ignored for `relay`: the local CLI already knows which model it drives.
   */
  model: string;
  /** `relay` only: the port + token printed by `skillwright serve`. */
  relayPort?: number;
  relayToken?: string;
  /**
   * Where to POST. Required for `custom` — that's how a user brings their OWN
   * gateway (OpenRouter, LiteLLM, Azure, a corporate proxy) or points at a
   * local model. Skillwright operates no gateway of its own. Optional for the
   * hosted providers, where it overrides the default endpoint (e.g. a proxy in
   * front of Anthropic).
   */
  baseUrl?: string;
}

/** The subset of `chrome.storage.local` this module needs. Kept minimal and
 * injectable (no reaching for the global `chrome` inside test paths) so it's
 * unit-testable, matching how `debugger-lifecycle.ts` injects its `chrome.*`
 * dependency instead of reading the global directly. */
export interface LlmSettingsStorage {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function defaultStorage(): LlmSettingsStorage {
  return chrome.storage.local as unknown as LlmSettingsStorage;
}

function isCompleteSettings(value: unknown): value is LlmSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const providerOk =
    v.provider === "anthropic" ||
    v.provider === "openai" ||
    v.provider === "custom" ||
    v.provider === "relay";
  if (!providerOk) return false;
  if (typeof v.apiKey !== "string") return false;

  if (v.provider === "relay") {
    // No key, no model: the local CLI owns both. It needs the pairing details
    // `skillwright serve` printed, and nothing else.
    return (
      typeof v.relayPort === "number" &&
      Number.isFinite(v.relayPort) &&
      typeof v.relayToken === "string" &&
      v.relayToken.length > 0
    );
  }

  if (typeof v.model !== "string" || v.model.length === 0) return false;

  if (v.provider === "custom") {
    // No key needed (local models), but we must know WHERE to send the request.
    return typeof v.baseUrl === "string" && v.baseUrl.length > 0;
  }
  // Hosted providers: the key is what makes the call possible at all.
  if (v.apiKey.length === 0) return false;
  return v.baseUrl === undefined || typeof v.baseUrl === "string";
}

/**
 * Reads BYO-key LLM settings from `chrome.storage.local`. Returns `undefined`
 * (rather than throwing) when unset or incomplete so callers can fall back to
 * "no backend configured yet" without special-casing storage errors.
 */
export async function readLlmSettings(
  storage: LlmSettingsStorage = defaultStorage(),
): Promise<LlmSettings | undefined> {
  const result = await storage.get(STORAGE_KEY);
  const value = result[STORAGE_KEY];
  return isCompleteSettings(value) ? value : undefined;
}

/**
 * Persists BYO-key LLM settings to `chrome.storage.local`. This is the ONLY
 * place the API key should be written to disk — never into a skill, a
 * recording, an export, or a log line.
 */
export async function writeLlmSettings(
  s: LlmSettings,
  storage: LlmSettingsStorage = defaultStorage(),
): Promise<void> {
  await storage.set({ [STORAGE_KEY]: s });
}
