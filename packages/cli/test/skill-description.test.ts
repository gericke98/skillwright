import { describe, expect, test } from "vitest";
import { sanitizeSkillDescription } from "../src/distill/sanitize";

describe("sanitizeSkillDescription — Agent Skills frontmatter safety", () => {
  test("collapses newlines to spaces (a raw newline breaks YAML frontmatter)", () => {
    const out = sanitizeSkillDescription("Line one\nLine two\r\nLine three");
    expect(out).not.toMatch(/[\r\n]/);
    expect(out).toBe("Line one Line two Line three");
  });

  test("collapses runs of whitespace/tabs to a single space and trims", () => {
    expect(sanitizeSkillDescription("  a\t\t b   c  ")).toBe("a b c");
  });

  test("truncates to the 1024-char spec limit", () => {
    const out = sanitizeSkillDescription("x".repeat(2000));
    expect(out.length).toBeLessThanOrEqual(1024);
  });

  test("leaves a normal description untouched", () => {
    expect(sanitizeSkillDescription("Approves a pending invoice by number.")).toBe(
      "Approves a pending invoice by number.",
    );
  });

  test("never returns empty (a blank description is invalid) — falls back", () => {
    expect(sanitizeSkillDescription("   \n  ").length).toBeGreaterThan(0);
    expect(sanitizeSkillDescription("").length).toBeGreaterThan(0);
  });
});
