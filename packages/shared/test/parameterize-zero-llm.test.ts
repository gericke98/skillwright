import { describe, expect, test } from "vitest";
import type { Recording } from "../src/index";
import { PLACEHOLDER } from "../src/redact";
import { parameterizeWithoutLlm } from "../src/parameterize";

/** A login recording as capture produces it: the password already redacted. */
const login: Recording = {
  title: "Sign in",
  steps: [
    { type: "change", selectors: [["aria/Username"]], value: "alice", timestamp: 1 },
    { type: "change", selectors: [["aria/Password"]], value: PLACEHOLDER, timestamp: 2 },
    { type: "click", selectors: [["aria/Sign in"]], timestamp: 3 },
  ],
  "x-skillwright": {
    version: 1,
    segment: { id: "s1", parentSkill: null, recordedAt: "2026-01-01T00:00:00.000Z" },
  },
};

/**
 * The degraded path: no API key, no LLM, no proposer, no critic. The
 * DETERMINISTIC secret floor must still fire — a user without a key should lose
 * smart parameter names, never the secret handling.
 */
describe("parameterizeWithoutLlm — the secret floor without a model", () => {
  test("a redacted secret still becomes a required, valueless, string param", () => {
    const params = parameterizeWithoutLlm(login);
    const password = params.find((p) => p.name === "password");
    expect(password).toBeDefined();
    expect(password).toMatchObject({
      name: "password",
      type: "string",
      required: true,
      demoValue: "",
      confidence: "high",
    });
  });

  test("the redaction placeholder never survives into a param", () => {
    const params = parameterizeWithoutLlm(login);
    expect(JSON.stringify(params)).not.toContain(PLACEHOLDER);
  });

  test("non-secret values are NOT parameterized (that's the part the LLM does)", () => {
    const params = parameterizeWithoutLlm(login);
    expect(params.map((p) => p.name)).toEqual(["password"]);
  });

  test("a recording with no secrets yields no params (not an error)", () => {
    const noSecrets: Recording = { ...login, steps: [login.steps[0]!, login.steps[2]!] };
    expect(parameterizeWithoutLlm(noSecrets)).toEqual([]);
  });

  test("is pure: never throws on a degenerate recording", () => {
    const empty: Recording = { ...login, steps: [] };
    expect(parameterizeWithoutLlm(empty)).toEqual([]);
  });

  test("every secret occurrence is covered, not just the first", () => {
    const twoSecrets: Recording = {
      ...login,
      steps: [
        { type: "change", selectors: [["aria/Password"]], value: PLACEHOLDER, timestamp: 1 },
        { type: "change", selectors: [["aria/Recovery Code"]], value: PLACEHOLDER, timestamp: 2 },
      ],
    };
    const names = parameterizeWithoutLlm(twoSecrets).map((p) => p.name);
    expect(names).toContain("password");
    expect(names).toContain("recovery-code");
    expect(parameterizeWithoutLlm(twoSecrets).every((p) => p.required && p.demoValue === "")).toBe(true);
  });
});
