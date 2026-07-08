import { describe, expect, test } from "vitest";
import { createDefaultBackend } from "../src/llm/factory";

describe("createDefaultBackend", () => {
  test("opts into the api backend when SKILLWRIGHT_API_KEY is set (the documented name)", () => {
    const backend = createDefaultBackend({ env: { SKILLWRIGHT_API_KEY: "sk-test" } });
    expect(backend.name).toMatch(/^api:/);
  });

  test("still honors the legacy BSKILL_API_KEY for back-compat", () => {
    const backend = createDefaultBackend({ env: { BSKILL_API_KEY: "sk-test" } });
    expect(backend.name).toMatch(/^api:/);
  });

  test("prefers SKILLWRIGHT_API_KEY over the legacy name when both are set", () => {
    const backend = createDefaultBackend({
      env: { SKILLWRIGHT_API_KEY: "sk-new", BSKILL_API_KEY: "sk-old" },
    });
    expect(backend.name).toMatch(/^api:/);
  });

  test("defaults to the agent-cli backend when no API key is present", () => {
    const backend = createDefaultBackend({
      env: {},
      agentCli: { detectBinary: () => "claude", runCommand: async () => "{}" },
    });
    expect(backend.name).toMatch(/^agent-cli:/);
  });
});
