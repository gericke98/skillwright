const STORAGE_KEY = "llmSettings";

export interface LlmSettings {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
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
  return (
    (v.provider === "anthropic" || v.provider === "openai") &&
    typeof v.apiKey === "string" &&
    v.apiKey.length > 0 &&
    typeof v.model === "string" &&
    v.model.length > 0
  );
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
