import { describe, it, expect } from "vitest";
import { inferParamCritique } from "../src/parameterize/critic";
import { MockBackend } from "./support/mock-backend";

const fake = (obj: unknown) => ({ name: "fake", complete: async () => obj as any });

describe("critic", () => {
  it("returns structured critique from the backend", async () => {
    const rec = { title: "t", steps: [] } as any;
    const c = await inferParamCritique(
      rec,
      [{ name: "account_id", type: "string", required: true, demoValue: "123" }],
      fake({
        removals: [],
        additions: [{ name: "region", type: "string", required: false, demoValue: "eu" }],
        typeFixes: [],
      }) as any,
    );
    expect(c.additions[0].name).toBe("region");
  });

  it("rejects a malformed critique (removal missing reason)", async () => {
    const rec = { title: "t", steps: [] } as any;
    const malformed = new MockBackend(() => ({
      removals: [{ name: "account_id" }],
      additions: [],
      typeFixes: [],
    }));
    await expect(
      inferParamCritique(rec, [{ name: "account_id", type: "string", required: true, demoValue: "123" }], malformed),
    ).rejects.toBeTruthy();
  });
});
