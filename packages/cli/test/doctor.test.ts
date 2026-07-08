import { describe, expect, test } from "vitest";
import { runDoctor, type DoctorProbes } from "../src/doctor";

const base: DoctorProbes = {
  env: {},
  which: () => false,
  canWrite: () => true,
  chromiumInstalled: () => true,
  nodeMajor: 22,
};

const status = (r: ReturnType<typeof runDoctor>, name: string) =>
  r.checks.find((c) => c.name === name)?.status;

describe("runDoctor — environment preflight", () => {
  test("all green: an agent CLI on PATH, writable library, chromium present", () => {
    const r = runDoctor({ ...base, which: (b) => b === "claude" });
    expect(status(r, "LLM backend")).toBe("pass");
    expect(status(r, "Skill library")).toBe("pass");
    expect(status(r, "Chromium (--cdp replay)")).toBe("pass");
    expect(r.ok).toBe(true);
  });

  test("no LLM backend is a hard FAIL — distillation cannot run", () => {
    const r = runDoctor({ ...base, which: () => false });
    expect(status(r, "LLM backend")).toBe("fail");
    expect(r.ok).toBe(false);
  });

  test("SKILLWRIGHT_API_KEY counts as a backend even with no CLI on PATH", () => {
    const r = runDoctor({ ...base, env: { SKILLWRIGHT_API_KEY: "sk" }, which: () => false });
    const backend = r.checks.find((c) => c.name === "LLM backend");
    expect(backend?.status).toBe("pass");
    expect(backend?.detail).toMatch(/api/i);
  });

  test("an unwritable skill library is a hard FAIL", () => {
    const r = runDoctor({ ...base, which: (b) => b === "claude", canWrite: () => false });
    expect(status(r, "Skill library")).toBe("fail");
    expect(r.ok).toBe(false);
  });

  test("missing chromium is a WARN, not a fail (relay path doesn't need it)", () => {
    const r = runDoctor({ ...base, which: (b) => b === "claude", chromiumInstalled: () => false });
    expect(status(r, "Chromium (--cdp replay)")).toBe("warn");
    expect(r.ok).toBe(true);
  });

  test("an ancient Node is a hard FAIL", () => {
    const r = runDoctor({ ...base, which: (b) => b === "claude", nodeMajor: 16 });
    expect(status(r, "Node")).toBe("fail");
    expect(r.ok).toBe(false);
  });

  test("reports which agent CLI was detected", () => {
    const r = runDoctor({ ...base, which: (b) => b === "codex" });
    expect(r.checks.find((c) => c.name === "LLM backend")?.detail).toContain("codex");
  });
});
