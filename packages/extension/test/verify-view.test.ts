// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import { renderVerify, renderVerifyResults } from "../src/pipeline/verify-view";
import type { VerifyResult } from "../src/verify/runner";

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = `<div id="root"></div>`;
  container = document.getElementById("root")!;
});

describe("renderVerify", () => {
  test("warns about the debugger banner before the user attaches it", () => {
    renderVerify(container, { onVerify: () => {} });
    expect(container.textContent).toContain("being debugged");
  });

  test("destructive steps are opt-in: the confirm box starts unchecked", () => {
    renderVerify(container, { onVerify: () => {} });
    const box = container.querySelector<HTMLInputElement>("#verify-confirm-destructive")!;
    expect(box.checked).toBe(false);
  });

  test("clicking verify reports confirmDestructive=false by default", () => {
    let opts: { confirmDestructive: boolean } | undefined;
    renderVerify(container, { onVerify: (o) => (opts = o) });
    container.querySelector<HTMLButtonElement>("#verify-run")!.click();
    expect(opts).toEqual({ confirmDestructive: false });
  });

  test("checking the box passes confirmDestructive=true", () => {
    let opts: { confirmDestructive: boolean } | undefined;
    renderVerify(container, { onVerify: (o) => (opts = o) });
    const box = container.querySelector<HTMLInputElement>("#verify-confirm-destructive")!;
    box.checked = true;
    container.querySelector<HTMLButtonElement>("#verify-run")!.click();
    expect(opts).toEqual({ confirmDestructive: true });
  });
});

describe("renderVerifyResults", () => {
  const ok: VerifyResult[] = [
    { index: 0, outcome: "ok" },
    { index: 1, outcome: "skipped-destructive" },
  ];

  beforeEach(() => {
    renderVerify(container, { onVerify: () => {} });
  });

  test("summarizes passes and skipped destructive steps", () => {
    renderVerifyResults(container, ok);
    expect(container.textContent).toContain("Verified 1 step");
    expect(container.textContent).toContain("skipped 1 destructive step");
  });

  test("a failure surfaces the failing step's error", () => {
    renderVerifyResults(container, [
      { index: 0, outcome: "fail", error: "step 1 (click aria/Gone): element not found" },
    ]);
    expect(container.textContent).toContain("element not found");
    expect(container.querySelector(".verify-fail")).not.toBeNull();
  });

  test("a run-level error (no tab) is shown instead of results", () => {
    renderVerifyResults(container, [], "no active tab to verify against");
    expect(container.textContent).toContain("no active tab");
  });

  test("page-authored error text is rendered as text, never markup", () => {
    renderVerifyResults(container, [], `<img src=x onerror=alert(1)>`);
    expect(container.innerHTML).not.toContain("<img");
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  test("re-rendering replaces prior results (no stale outcomes stack up)", () => {
    renderVerifyResults(container, ok);
    renderVerifyResults(container, [{ index: 0, outcome: "ok" }]);
    expect(container.querySelectorAll(".verify-list li")).toHaveLength(1);
  });
});
