import { describe, expect, test, vi } from "vitest";
import {
  completeWithRepair,
  SchemaExhaustedError,
  type SchemaSpec,
} from "../src/llm/backend";

interface Tag {
  effect: string;
}

/** Accepts only {effect: "readonly"|"mutating"|"destructive"}. */
const tagSchema: SchemaSpec<Tag> = {
  jsonSchema: { type: "object", required: ["effect"] },
  validate(value): string[] {
    if (typeof value !== "object" || value === null) return ["expected an object"];
    const effect = (value as Record<string, unknown>).effect;
    if (typeof effect !== "string") return ["missing string field 'effect'"];
    if (!["readonly", "mutating", "destructive"].includes(effect)) {
      return [`effect must be one of readonly|mutating|destructive, got '${effect}'`];
    }
    return [];
  },
};

describe("completeWithRepair", () => {
  test("returns the validated object on a first valid response", async () => {
    const generate = vi.fn(async () => '{"effect":"destructive"}');
    const result = await completeWithRepair(generate, "tag this step", tagSchema, 3);
    expect(result).toEqual({ effect: "destructive" });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test("reprompts with the validation error, then succeeds on the retry", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce('{"effect":"nuke"}') // invalid enum
      .mockResolvedValueOnce('{"effect":"mutating"}');
    const result = await completeWithRepair(generate, "tag this step", tagSchema, 3);
    expect(result).toEqual({ effect: "mutating" });
    expect(generate).toHaveBeenCalledTimes(2);
    // the second prompt must carry the validation feedback
    const secondPrompt = generate.mock.calls[1]![0] as string;
    expect(secondPrompt).toContain("nuke");
  });

  test("a response with no JSON at all counts as a failed attempt and reprompts", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce("I cannot help with that.")
      .mockResolvedValueOnce('{"effect":"readonly"}');
    const result = await completeWithRepair(generate, "tag this step", tagSchema, 3);
    expect(result).toEqual({ effect: "readonly" });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  test("throws SchemaExhaustedError after the full budget is spent", async () => {
    const generate = vi.fn(async () => '{"effect":"nope"}');
    await expect(completeWithRepair(generate, "tag", tagSchema, 3)).rejects.toBeInstanceOf(
      SchemaExhaustedError,
    );
    expect(generate).toHaveBeenCalledTimes(3);
  });

  test("api budget of 1 means a single attempt then throw", async () => {
    const generate = vi.fn(async () => "not json");
    await expect(completeWithRepair(generate, "tag", tagSchema, 1)).rejects.toBeInstanceOf(
      SchemaExhaustedError,
    );
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
