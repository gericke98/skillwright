import { describe, it, expect } from "vitest";
import { readLlmSettings, writeLlmSettings, type LlmSettingsStorage } from "../src/llm/settings";

function fakeStorage(): LlmSettingsStorage {
  const backing: Record<string, unknown> = {};
  return {
    async get(keys) {
      const key = Array.isArray(keys) ? keys[0] : keys;
      if (key == null) return { ...backing };
      return key in backing ? { [key]: backing[key] } : {};
    },
    async set(items) {
      Object.assign(backing, items);
    },
  };
}

describe("llm settings", () => {
  it("returns undefined when unset", async () => {
    const storage = fakeStorage();
    expect(await readLlmSettings(storage)).toBeUndefined();
  });

  it("round-trips settings through storage", async () => {
    const storage = fakeStorage();
    await writeLlmSettings({ provider: "anthropic", apiKey: "sk-abc", model: "claude-sonnet-5" }, storage);
    expect(await readLlmSettings(storage)).toEqual({
      provider: "anthropic",
      apiKey: "sk-abc",
      model: "claude-sonnet-5",
    });
  });

  it("returns undefined when stored settings are incomplete", async () => {
    const storage = fakeStorage();
    await storage.set({ llmSettings: { provider: "openai", apiKey: "" } });
    expect(await readLlmSettings(storage)).toBeUndefined();
  });
});

/**
 * A `custom` provider is how a user brings their OWN gateway — OpenRouter,
 * LiteLLM, Azure, a corporate proxy — or points at a local model. Skillwright
 * runs no gateway of its own.
 */
describe("llm settings — custom / OpenAI-compatible endpoint", () => {
  it("round-trips a custom provider with a baseUrl", async () => {
    const storage = fakeStorage();
    await writeLlmSettings(
      { provider: "custom", apiKey: "sk-or-1", model: "llama-3.3", baseUrl: "https://openrouter.ai/api/v1/chat/completions" },
      storage,
    );
    expect(await readLlmSettings(storage)).toMatchObject({
      provider: "custom",
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    });
  });

  it("accepts a custom provider with NO api key (a local model needs none)", async () => {
    const storage = fakeStorage();
    await writeLlmSettings(
      { provider: "custom", apiKey: "", model: "llama3", baseUrl: "http://localhost:11434/v1/chat/completions" },
      storage,
    );
    const read = await readLlmSettings(storage);
    expect(read).toBeDefined();
    expect(read!.apiKey).toBe("");
  });

  it("rejects a custom provider with no baseUrl (nowhere to send the request)", async () => {
    const storage = fakeStorage();
    await storage.set({ llmSettings: { provider: "custom", apiKey: "k", model: "m" } });
    expect(await readLlmSettings(storage)).toBeUndefined();
  });

  it("still requires an api key for the hosted providers", async () => {
    const storage = fakeStorage();
    await storage.set({ llmSettings: { provider: "anthropic", apiKey: "", model: "claude-sonnet-5" } });
    expect(await readLlmSettings(storage)).toBeUndefined();
  });
});
