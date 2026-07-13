import { describe, expect, test, vi } from "vitest";
import type { LlmBackend, Recording } from "@skillwright/shared";
import { PLACEHOLDER } from "@skillwright/shared";
import { runParameterize } from "../src/pipeline/run-parameterize";

const login: Recording = {
  title: "Sign in",
  steps: [
    { type: "change", selectors: [["aria/Username"]], value: "alice", timestamp: 1 },
    { type: "change", selectors: [["aria/Password"]], value: PLACEHOLDER, timestamp: 2 },
  ],
  "x-skillwright": {
    version: 1,
    segment: { id: "s1", parentSkill: null, recordedAt: "2026-01-01T00:00:00.000Z" },
  },
};

/** A backend whose every call fails, like a bad key or a rate limit would. */
function brokenBackend(message: string): LlmBackend {
  return {
    name: "broken",
    complete: vi.fn(async () => {
      throw new Error(message);
    }),
  };
}

describe("runParameterize — never dead-ends the pipeline", () => {
  test("with NO backend, still returns the secret as a required param", async () => {
    const result = await runParameterize(login, undefined);
    expect(result.usedLlm).toBe(false);
    expect(result.llmError).toBeUndefined();
    expect(result.params.map((p) => p.name)).toEqual(["password"]);
    expect(result.params[0]).toMatchObject({ required: true, demoValue: "", type: "string" });
  });

  test("a failing backend degrades instead of throwing — and reports why", async () => {
    const result = await runParameterize(login, brokenBackend("401 invalid api key"));
    expect(result.usedLlm).toBe(false);
    expect(result.llmError).toContain("401 invalid api key");
    // The secret floor still fired.
    expect(result.params.map((p) => p.name)).toEqual(["password"]);
  });

  test("the redaction placeholder never leaks into params on the degraded path", async () => {
    const result = await runParameterize(login, brokenBackend("boom"));
    expect(JSON.stringify(result.params)).not.toContain(PLACEHOLDER);
  });

  test("a working backend is used and reported as such", async () => {
    const backend: LlmBackend = {
      name: "ok",
      complete: vi.fn(async (_p: string, _s: unknown) => {
        // proposer call, then critic call
        const calls = (backend.complete as ReturnType<typeof vi.fn>).mock.calls.length;
        return calls === 1
          ? { params: [{ name: "username", type: "string", required: true, demoValue: "alice" }] }
          : { removals: [], additions: [], typeFixes: [] };
      }) as unknown as LlmBackend["complete"],
    };
    const result = await runParameterize(login, backend);
    expect(result.usedLlm).toBe(true);
    const names = result.params.map((p) => p.name);
    expect(names).toContain("username");
    // The floor still adds the secret the proposer never mentioned.
    expect(names).toContain("password");
  });

  test("a degenerate recording yields no params rather than crashing the panel", async () => {
    const junk = { steps: undefined } as unknown as Recording;
    await expect(runParameterize(junk, undefined)).resolves.toEqual({ params: [], usedLlm: false });
  });
});
