import { describe, expect, test } from "vitest";
import { roundUpEffect } from "../src/index";

describe("roundUpEffect", () => {
  test("returns the single tag when only one candidate", () => {
    expect(roundUpEffect(["mutating"])).toBe("mutating");
  });

  test("escalates to the most severe candidate", () => {
    expect(roundUpEffect(["readonly", "destructive", "mutating"])).toBe("destructive");
    expect(roundUpEffect(["readonly", "mutating"])).toBe("mutating");
    expect(roundUpEffect(["readonly", "readonly"])).toBe("readonly");
  });

  test("defaults to destructive when there is no signal at all (round up on uncertainty)", () => {
    expect(roundUpEffect([])).toBe("destructive");
  });
});
