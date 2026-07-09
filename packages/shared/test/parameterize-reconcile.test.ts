import { describe, it, expect } from "vitest";
import { reconcileParams } from "../src/parameterize/reconcile";

describe("reconcile", () => {
  it("keeps a secret param even if the critic tries to remove it", () => {
    const out = reconcileParams(
      [{ name: "password", type: "string", required: true, demoValue: "" }],
      { removals: [{ name: "password", reason: "looks constant" }], additions: [], typeFixes: [] },
      new Set(["password"]),
    );
    const kept = out.find((p) => p.name === "password");
    expect(kept).toBeTruthy();
    expect(kept?.required).toBe(true);
  });

  it("drops a non-secret param when the critic gives a reason", () => {
    const out = reconcileParams(
      [{ name: "sort_order", type: "string", required: false, demoValue: "asc" }],
      { removals: [{ name: "sort_order", reason: "UI-fixed default" }], additions: [], typeFixes: [] },
      new Set(),
    );
    expect(out.find((p) => p.name === "sort_order")).toBeUndefined();
  });

  it("unions critic additions", () => {
    const out = reconcileParams(
      [],
      { removals: [], additions: [{ name: "region", type: "string", required: false, demoValue: "eu" }], typeFixes: [] },
      new Set(),
    );
    expect(out.map((p) => p.name)).toContain("region");
  });

  it("ignores a removal without a reason (param is kept)", () => {
    const out = reconcileParams(
      [{ name: "sort_order", type: "string", required: false, demoValue: "asc" }],
      { removals: [{ name: "sort_order", reason: "" }], additions: [], typeFixes: [] },
      new Set(),
    );
    expect(out.find((p) => p.name === "sort_order")).toBeTruthy();
  });

  it("force-adds a secret the proposer missed, with required:true", () => {
    const out = reconcileParams([], { removals: [], additions: [], typeFixes: [] }, new Set(["api_key"]));
    const added = out.find((p) => p.name === "api_key");
    expect(added).toBeTruthy();
    expect(added?.required).toBe(true);
    expect(added?.demoValue).toBe("");
    expect(added?.confidence).toBe("high");
  });

  it("does not double-add a critic addition whose name is already present", () => {
    const out = reconcileParams(
      [{ name: "region", type: "string", required: false, demoValue: "us" }],
      { removals: [], additions: [{ name: "region", type: "string", required: false, demoValue: "eu" }], typeFixes: [] },
      new Set(),
    );
    expect(out.filter((p) => p.name === "region")).toHaveLength(1);
  });

  it("applies a typeFix that flips required", () => {
    const out = reconcileParams(
      [{ name: "sort_order", type: "string", required: false, demoValue: "asc" }],
      { removals: [], additions: [], typeFixes: [{ name: "sort_order", required: true }] },
      new Set(),
    );
    const fixed = out.find((p) => p.name === "sort_order");
    expect(fixed?.required).toBe(true);
    expect(fixed?.confidence).toBe("medium");
  });

  it("handles empty proposal, empty critique, empty secrets", () => {
    const out = reconcileParams([], { removals: [], additions: [], typeFixes: [] }, new Set());
    expect(out).toEqual([]);
  });

  it("secret floor beats a typeFix that un-requires it", () => {
    const out = reconcileParams(
      [{ name: "api_key", type: "string", required: true, demoValue: "" }],
      { removals: [], additions: [], typeFixes: [{ name: "api_key", required: false }] },
      new Set(["api_key"]),
    );
    const fixed = out.find((p) => p.name === "api_key");
    expect(fixed?.required).toBe(true);
  });

  it("secret floor beats a typeFix that changes its type", () => {
    const out = reconcileParams(
      [{ name: "api_key", type: "string", required: true, demoValue: "" }],
      { removals: [], additions: [], typeFixes: [{ name: "api_key", type: "number" }] },
      new Set(["api_key"]),
    );
    const fixed = out.find((p) => p.name === "api_key");
    expect(fixed?.type).toBe("string");
    expect(fixed?.required).toBe(true);
  });

  it("secret floor strips a colliding critic addition's demoValue and type", () => {
    const out = reconcileParams(
      [],
      {
        removals: [],
        additions: [{ name: "api_key", type: "number", required: false, demoValue: "hunter2" }],
        typeFixes: [],
      },
      new Set(["api_key"]),
    );
    const added = out.find((p) => p.name === "api_key");
    expect(added?.demoValue).toBe("");
    expect(added?.type).toBe("string");
    expect(added?.required).toBe(true);
  });

  it("a name in both removals (with a valid reason) and additions is removed then re-added (addition wins)", () => {
    const out = reconcileParams(
      [{ name: "region", type: "string", required: false, demoValue: "us" }],
      {
        removals: [{ name: "region", reason: "no longer used" }],
        additions: [{ name: "region", type: "string", required: true, demoValue: "eu" }],
        typeFixes: [],
      },
      new Set(),
    );
    const matches = out.filter((p) => p.name === "region");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.demoValue).toBe("eu");
    expect(matches[0]?.required).toBe(true);
  });
});
