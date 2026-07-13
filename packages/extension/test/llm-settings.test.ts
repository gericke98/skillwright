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
