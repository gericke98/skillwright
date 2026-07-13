import { describe, expect, test, vi } from "vitest";
import type { SkillDirectory } from "@skillwright/shared";
import { runExport, type ExportDeps } from "../src/pipeline/run-export";

const skill: SkillDirectory = { slug: "demo", files: { "SKILL.md": "# hi" } };
const handle = {} as FileSystemDirectoryHandle;

function deps(over: Partial<ExportDeps> = {}): ExportDeps & { download: ReturnType<typeof vi.fn> } {
  return {
    restore: vi.fn(async () => handle),
    pick: vi.fn(async () => handle),
    save: vi.fn(async () => {}),
    download: vi.fn(),
    ...over,
  } as ExportDeps & { download: ReturnType<typeof vi.fn> };
}

function abortError(): DOMException {
  return new DOMException("The user aborted a request.", "AbortError");
}

describe("runExport — Tier 1 (skill folder)", () => {
  test("writes via a restored handle without opening the picker", async () => {
    const d = deps();
    const out = await runExport(skill, d);
    expect(out).toEqual({ tier: "folder" });
    expect(d.pick).not.toHaveBeenCalled();
    expect(d.save).toHaveBeenCalledWith(skill, handle);
    expect(d.download).not.toHaveBeenCalled();
  });

  test("opens the picker when no handle is persisted", async () => {
    const d = deps({ restore: vi.fn(async () => undefined) });
    const out = await runExport(skill, d);
    expect(out).toEqual({ tier: "folder" });
    expect(d.pick).toHaveBeenCalled();
    expect(d.download).not.toHaveBeenCalled();
  });
});

describe("runExport — Tier 0 fallback", () => {
  test("cancelled picker (AbortError) downloads instead", async () => {
    const d = deps({
      restore: vi.fn(async () => undefined),
      pick: vi.fn(async () => {
        throw abortError();
      }),
    });
    const out = await runExport(skill, d);
    expect(out.tier).toBe("download");
    expect(d.download).toHaveBeenCalledWith(skill);
    expect(out).toMatchObject({ reason: expect.stringContaining("downloads folder") });
  });

  test("denied permission on the picker downloads instead", async () => {
    const d = deps({
      restore: vi.fn(async () => undefined),
      pick: vi.fn(async () => {
        throw new DOMException("denied", "NotAllowedError");
      }),
    });
    const out = await runExport(skill, d);
    expect(out.tier).toBe("download");
    expect(d.download).toHaveBeenCalledWith(skill);
  });

  test("a mid-write save failure still leaves the user a complete copy", async () => {
    const d = deps({
      save: vi.fn(async () => {
        throw new Error("QuotaExceededError");
      }),
    });
    const out = await runExport(skill, d);
    expect(out.tier).toBe("download");
    expect(d.download).toHaveBeenCalledWith(skill);
    expect(out).toMatchObject({ reason: expect.stringContaining("QuotaExceededError") });
  });

  test("a save failure never re-opens the picker", async () => {
    const d = deps({
      save: vi.fn(async () => {
        throw new Error("folder is gone");
      }),
    });
    await runExport(skill, d);
    expect(d.pick).not.toHaveBeenCalled();
  });
});

describe("runExport — totality", () => {
  test("never throws, even when every dep throws", async () => {
    const d = deps({
      restore: vi.fn(async () => {
        throw new Error("idb is broken");
      }),
      pick: vi.fn(async () => {
        throw new Error("unreachable");
      }),
    });
    await expect(runExport(skill, d)).resolves.toMatchObject({ tier: "download" });
    expect(d.download).toHaveBeenCalledWith(skill);
  });
});
