import { describe, expect, test, vi } from "vitest";
import { SchemaExhaustedError, type SchemaSpec } from "@skillwright/shared";
import { MockBackend } from "../src/llm/mock-backend";
import { createAgentCliBackend } from "../src/llm/agent-cli-backend";
import { createApiBackend } from "../src/llm/api-backend";

interface Tag {
  effect: string;
}
const tagSchema: SchemaSpec<Tag> = {
  jsonSchema: { type: "object", required: ["effect"] },
  validate(value): string[] {
    const effect = (value as Record<string, unknown> | null)?.effect;
    return typeof effect === "string" ? [] : ["missing string 'effect'"];
  },
};

describe("MockBackend", () => {
  test("returns the responder's value when it satisfies the schema", async () => {
    const backend = new MockBackend(() => ({ effect: "destructive" }));
    expect(await backend.complete("x", tagSchema)).toEqual({ effect: "destructive" });
  });

  test("throws when the canned value fails validation", async () => {
    const backend = new MockBackend(() => ({ wrong: true }));
    await expect(backend.complete("x", tagSchema)).rejects.toBeInstanceOf(SchemaExhaustedError);
  });

  test("routes on the prompt so a distiller's distinct calls get distinct answers", async () => {
    const backend = new MockBackend((prompt) =>
      prompt.includes("effect") ? { effect: "mutating" } : { effect: "readonly" },
    );
    expect(await backend.complete("classify effect", tagSchema)).toEqual({ effect: "mutating" });
  });
});

describe("createAgentCliBackend", () => {
  test("detects a binary, runs it, and returns validated JSON", async () => {
    const runCommand = vi.fn(async () => 'Here you go:\n```json\n{"effect":"destructive"}\n```');
    const backend = createAgentCliBackend({
      detectBinary: () => "claude",
      runCommand,
    });
    expect(backend.name).toContain("claude");
    expect(await backend.complete("tag step", tagSchema)).toEqual({ effect: "destructive" });
    expect(runCommand).toHaveBeenCalledOnce();
    expect(runCommand.mock.calls[0]![0]).toBe("claude");
  });

  test("reprompts up to the CLI budget of 3 on malformed output", async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce("no json here")
      .mockResolvedValueOnce("still nothing")
      .mockResolvedValueOnce('{"effect":"readonly"}');
    const backend = createAgentCliBackend({ detectBinary: () => "codex", runCommand });
    expect(await backend.complete("tag", tagSchema)).toEqual({ effect: "readonly" });
    expect(runCommand).toHaveBeenCalledTimes(3);
  });

  test("throws a clear error when no agent binary is found", () => {
    expect(() =>
      createAgentCliBackend({ detectBinary: () => undefined }),
    ).toThrow(/no agent CLI/i);
  });
});

describe("createApiBackend", () => {
  test("uses native tool structured output and validates (budget 1)", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ content: [{ type: "tool_use", input: { effect: "mutating" } }] }),
        { status: 200 },
      ),
    );
    const backend = createApiBackend({ apiKey: "test-key", fetchImpl });
    expect(await backend.complete("tag step", tagSchema)).toEqual({ effect: "mutating" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test("throws SchemaExhaustedError immediately on invalid output (no CLI-style retries)", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: "tool_use", input: { nope: 1 } }] }), {
        status: 200,
      }),
    );
    const backend = createApiBackend({ apiKey: "test-key", fetchImpl });
    await expect(backend.complete("tag", tagSchema)).rejects.toBeInstanceOf(SchemaExhaustedError);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
