import { describe, expect, test } from "vitest";
import { createDefaultBackend } from "../src/llm/factory";

describe("createDefaultBackend", () => {
  test("opts into the api backend when BSKILL_API_KEY is set", () => {
    const backend = createDefaultBackend({ env: { BSKILL_API_KEY: "sk-test" } });
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
