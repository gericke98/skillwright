import { afterEach, describe, expect, test, vi } from "vitest";
import type { SkillDirectory } from "@skillwright/shared";
import { pickAndPersistHandle, restoreHandle, saveSkillToFolder, type HandleStore } from "../src/export/fs-access";
import { downloadSkill } from "../src/export/downloads";

/** Recording mock of the File System Access directory-handle tree. */
function mockDir() {
  const writes: Record<string, string> = {};
  const file = (path: string) => ({
    createWritable: async () => ({
      write: async (d: string) => {
        writes[path] = d;
      },
      close: async () => {},
    }),
  });
  const dir = (base: string): any => ({
    getDirectoryHandle: async (n: string) => dir(`${base}${n}/`),
    getFileHandle: async (n: string) => file(`${base}${n}`),
  });
  return { root: dir(""), writes };
}

const skill: SkillDirectory = {
  slug: "demo",
  files: {
    "SKILL.md": "# hi",
    "scripts/replay.ts": "// script",
    "assets/recording.json": "{}",
  },
};

describe("saveSkillToFolder", () => {
  test("writes the skill under skillwright/<slug>/", async () => {
    const { root, writes } = mockDir();
    await saveSkillToFolder({ slug: "demo", files: { "SKILL.md": "# hi" } }, root);
    expect(writes["skillwright/demo/SKILL.md"]).toBe("# hi");
  });

  test("creates nested directories for multi-segment paths", async () => {
    const { root, writes } = mockDir();
    await saveSkillToFolder(skill, root);
    expect(writes["skillwright/demo/scripts/replay.ts"]).toBe("// script");
    expect(writes["skillwright/demo/assets/recording.json"]).toBe("{}");
  });
});

function fakeHandle(perm: { query: PermissionState; request?: PermissionState }) {
  return {
    queryPermission: vi.fn(async () => perm.query),
    requestPermission: vi.fn(async () => perm.request ?? perm.query),
  } as unknown as FileSystemDirectoryHandle;
}

function memoryStore(initial?: FileSystemDirectoryHandle): HandleStore {
  let held = initial;
  return {
    get: async () => held,
    set: async (h) => {
      held = h;
    },
  };
}

describe("restoreHandle", () => {
  test("returns undefined when nothing was persisted", async () => {
    expect(await restoreHandle(memoryStore())).toBeUndefined();
  });

  test("returns the handle when permission is still granted", async () => {
    const h = fakeHandle({ query: "granted" });
    expect(await restoreHandle(memoryStore(h))).toBe(h);
  });

  test("re-requests permission and returns the handle when re-granted", async () => {
    const h = fakeHandle({ query: "prompt", request: "granted" });
    expect(await restoreHandle(memoryStore(h))).toBe(h);
    expect((h as any).requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
  });

  test("returns undefined when the user denies the re-request", async () => {
    const h = fakeHandle({ query: "prompt", request: "denied" });
    expect(await restoreHandle(memoryStore(h))).toBeUndefined();
  });
});

describe("pickAndPersistHandle", () => {
  test("stores the picked handle and returns it", async () => {
    const h = fakeHandle({ query: "granted" });
    const store = memoryStore();
    const picker = vi.fn(async () => h);
    expect(await pickAndPersistHandle(picker, store)).toBe(h);
    expect(await store.get()).toBe(h);
  });

  test("a handle that can't be persisted is still returned (persisting is an optimization)", async () => {
    // Private browsing / blocked storage: IndexedDB refuses the handle. The
    // folder the user just picked is still perfectly usable — throwing here
    // would downgrade a successful pick into a downloads-folder fallback.
    const h = fakeHandle({ query: "granted" });
    const hostileStore: HandleStore = {
      get: async () => undefined,
      set: async () => {
        throw new DOMException("cannot clone", "DataCloneError");
      },
    };
    await expect(pickAndPersistHandle(async () => h, hostileStore)).resolves.toBe(h);
  });

  test("a cancelled picker still propagates (the caller owns the fallback)", async () => {
    const store = memoryStore();
    const picker = async () => {
      throw new DOMException("aborted", "AbortError");
    };
    await expect(pickAndPersistHandle(picker, store)).rejects.toThrow();
  });
});

describe("downloadSkill (Tier 0 fallback)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("downloads every file into skillwright/<slug>/", () => {
    const download = vi.fn();
    vi.stubGlobal("chrome", { downloads: { download } });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });

    downloadSkill(skill);

    const filenames = download.mock.calls.map(([opts]) => opts.filename);
    expect(filenames).toEqual([
      "skillwright/demo/SKILL.md",
      "skillwright/demo/scripts/replay.ts",
      "skillwright/demo/assets/recording.json",
    ]);
    for (const [opts] of download.mock.calls) expect(opts.url).toBe("blob:fake");
  });
});
