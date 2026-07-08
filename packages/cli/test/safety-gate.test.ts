import { describe, expect, test } from "vitest";
import { gateStep } from "../src/index";

describe("replay safety gate (§6.2)", () => {
  describe("destructive steps require confirmation", () => {
    test("destructive on the initial run without --confirm-destructive → confirm", () => {
      expect(
        gateStep("destructive", { confirmDestructive: false, phase: "initial", partiallyExecuted: false }),
      ).toBe("confirm");
    });

    test("destructive with --confirm-destructive → proceed", () => {
      expect(
        gateStep("destructive", { confirmDestructive: true, phase: "initial", partiallyExecuted: false }),
      ).toBe("proceed");
    });
  });

  describe("heal never re-runs a partially-executed mutating-or-worse step", () => {
    test("mutating step that may have partially executed during a heal → halt", () => {
      expect(
        gateStep("mutating", { confirmDestructive: true, phase: "heal", partiallyExecuted: true }),
      ).toBe("halt");
    });

    test("destructive step that may have partially executed during a heal → halt", () => {
      expect(
        gateStep("destructive", { confirmDestructive: true, phase: "heal", partiallyExecuted: true }),
      ).toBe("halt");
    });

    test("readonly step heals freely even after partial execution → proceed", () => {
      expect(
        gateStep("readonly", { confirmDestructive: false, phase: "heal", partiallyExecuted: true }),
      ).toBe("proceed");
    });

    test("mutating step in a heal that did NOT partially execute → proceed", () => {
      expect(
        gateStep("mutating", { confirmDestructive: true, phase: "heal", partiallyExecuted: false }),
      ).toBe("proceed");
    });
  });

  describe("ordinary flow", () => {
    test("readonly always proceeds", () => {
      expect(
        gateStep("readonly", { confirmDestructive: false, phase: "initial", partiallyExecuted: false }),
      ).toBe("proceed");
    });

    test("mutating on the initial run proceeds without confirmation", () => {
      expect(
        gateStep("mutating", { confirmDestructive: false, phase: "initial", partiallyExecuted: false }),
      ).toBe("proceed");
    });
  });
});
