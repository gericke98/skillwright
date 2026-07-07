import { describe, expect, test } from "vitest";
import type { Step } from "@bskill/shared";
import { coalesceSteps } from "../src/index";

const click = (sel: string): Step => ({ type: "click", effect: "mutating", selectors: [[sel]] });
const change = (sel: string, value: string): Step => ({
  type: "change",
  effect: "mutating",
  selectors: [[sel]],
  value,
});

describe("coalesceSteps — drop the focus-click before a same-target edit", () => {
  test("removes a click immediately followed by a change on the same target", () => {
    const out = coalesceSteps([click("aria/Password"), change("aria/Password", "{secret}")]);
    expect(out).toEqual([change("aria/Password", "{secret}")]);
  });

  test("keeps a click when the following change targets a DIFFERENT element", () => {
    const steps = [click("aria/Password"), change("aria/Search", "INV-001")];
    expect(coalesceSteps(steps)).toEqual(steps);
  });

  test("keeps a click with no following change (e.g. the destructive delete)", () => {
    const steps = [change("aria/Search", "INV-001"), click("aria/Delete")];
    expect(coalesceSteps(steps)).toEqual(steps);
  });

  test("keeps two consecutive clicks", () => {
    const steps = [click("aria/A"), click("aria/B")];
    expect(coalesceSteps(steps)).toEqual(steps);
  });

  test("cleans the real 7-step invoice recording down to the meaningful actions", () => {
    const steps = [
      click("main"),
      click("aria/Password"),
      change("aria/Password", "{secret}"),
      click("aria/Search invoices"),
      change("aria/Search invoices", "INV-001"),
      click("aria/Username"),
      click("aria/Delete invoice INV-001"),
    ];
    const out = coalesceSteps(steps);
    // The two focus-clicks before edits are gone; the stray main/username
    // clicks and the destructive delete remain (faithful user actions).
    expect(out.map((s) => `${s.type}:${s.selectors![0]![0]}`)).toEqual([
      "click:main",
      "change:aria/Password",
      "change:aria/Search invoices",
      "click:aria/Username",
      "click:aria/Delete invoice INV-001",
    ]);
  });
});
