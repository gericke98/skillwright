import { describe, expect, test } from "vitest";
import type { Recording } from "../src/index";
import { PLACEHOLDER } from "../src/redact";
import { parameterize, secretNamesOf } from "../src/parameterize";
import type { LlmBackend, SchemaSpec } from "../src/llm/backend";

/**
 * Recording:
 *  0. username        -> "alice"        (normal param)
 *  1. password        -> PLACEHOLDER    (secret, claimed by the proposer)
 *  2. recovery code   -> PLACEHOLDER    (secret, MISSED by the proposer entirely)
 *  3. submit click    -> no value
 *
 * The proposer also proposes a bogus `sort_order` param that the critic will
 * remove with a reason, and the critic separately adds `org_slug`.
 */
const recording: Recording = {
  title: "Sign in and set order",
  steps: [
    { type: "change", selectors: [["aria/Username"]], value: "alice", timestamp: 1 },
    { type: "change", selectors: [["aria/Password"]], value: PLACEHOLDER, timestamp: 2 },
    { type: "change", selectors: [["aria/Recovery Code"]], value: PLACEHOLDER, timestamp: 3 },
    { type: "click", selectors: [["aria/Submit"]], timestamp: 4 },
  ],
  "x-skillwright": {
    version: 1,
    segment: { id: "s1", parentSkill: null, recordedAt: "2026-01-01T00:00:00.000Z" },
  },
};

const proposalPayload = {
  params: [
    { name: "username", type: "string", required: true, demoValue: "alice" },
    { name: "password", type: "string", required: true, demoValue: PLACEHOLDER },
    { name: "sort_order", type: "string", required: false, demoValue: "asc" },
  ],
};

const critiquePayload = {
  removals: [{ name: "sort_order", reason: "UI-fixed default, never varies" }],
  additions: [{ name: "org_slug", type: "string", required: true, demoValue: "acme" }],
  typeFixes: [],
};

/** Fake backend: 1st complete() call answers the proposer, 2nd answers the critic. */
function fakeBackend(): { backend: LlmBackend; callCount: () => number } {
  let calls = 0;
  const backend: LlmBackend = {
    name: "fake",
    async complete<T>(_prompt: string, _schema: SchemaSpec<T>): Promise<T> {
      calls += 1;
      if (calls === 1) return proposalPayload as unknown as T;
      if (calls === 2) return critiquePayload as unknown as T;
      throw new Error(`unexpected 3rd backend call: ${_prompt}`);
    },
  };
  return { backend, callCount: () => calls };
}

describe("parameterize", () => {
  test("makes exactly two backend calls", async () => {
    const { backend, callCount } = fakeBackend();
    await parameterize(recording, backend);
    expect(callCount()).toBe(2);
  });

  test("reflects both passes: critic addition present, reasoned removal gone", async () => {
    const { backend } = fakeBackend();
    const result = await parameterize(recording, backend);
    const names = result.map((p) => p.name);
    expect(names).toContain("org_slug");
    expect(names).not.toContain("sort_order");
    expect(names).toContain("username");
  });

  test("secret floor holds for a secret the proposer claimed", async () => {
    const { backend } = fakeBackend();
    const result = await parameterize(recording, backend);
    const password = result.find((p) => p.name === "password");
    expect(password).toBeTruthy();
    expect(password?.required).toBe(true);
    expect(password?.type).toBe("string");
    expect(password?.demoValue).toBe("");
    expect(password?.confidence).toBe("high");
  });

  test("force-adds a secret the proposer MISSED entirely", async () => {
    const { backend } = fakeBackend();
    const result = await parameterize(recording, backend);
    const recoveryCode = result.find((p) => p.name === "recovery-code");
    expect(recoveryCode).toBeTruthy();
    expect(recoveryCode?.required).toBe(true);
    expect(recoveryCode?.type).toBe("string");
    expect(recoveryCode?.demoValue).toBe("");
    expect(recoveryCode?.confidence).toBe("high");
  });
});

describe("secretNamesOf", () => {
  test("includes proposal-claimed secrets by name", () => {
    const names = secretNamesOf(recording, proposalPayload.params);
    expect(names.has("password")).toBe(true);
  });

  test("synthesizes a name for a PLACEHOLDER step no proposal param claims", () => {
    const names = secretNamesOf(recording, proposalPayload.params);
    expect(names.has("recovery-code")).toBe(true);
  });

  test("does not synthesize extra names when every placeholder step is claimed", () => {
    const proposalClaimsBoth = [
      { name: "password", type: "string", required: true, demoValue: PLACEHOLDER },
      { name: "recovery_code", type: "string", required: true, demoValue: PLACEHOLDER },
    ];
    const names = secretNamesOf(recording, proposalClaimsBoth);
    expect(names).toEqual(new Set(["password", "recovery_code"]));
  });

  test("falls back to secret_<index> when a missed step has no usable label", () => {
    const noLabelRecording: Recording = {
      ...recording,
      steps: [{ type: "change", value: PLACEHOLDER, timestamp: 1 }],
    };
    const names = secretNamesOf(noLabelRecording, []);
    expect(names.has("secret_0")).toBe(true);
  });
});
