// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { shouldCaptureKey, buildCaptureStep } from "../src/index";

describe("shouldCaptureKey — record meaningful keys, not plain typing", () => {
  test("captures Enter (form submit)", () => {
    expect(shouldCaptureKey({ key: "Enter" })).toBe(true);
  });
  test("captures Escape and arrows", () => {
    expect(shouldCaptureKey({ key: "Escape" })).toBe(true);
    expect(shouldCaptureKey({ key: "ArrowDown" })).toBe(true);
  });
  test("captures any key with a modifier (a shortcut)", () => {
    expect(shouldCaptureKey({ key: "s", ctrlKey: true })).toBe(true);
    expect(shouldCaptureKey({ key: "k", metaKey: true })).toBe(true);
  });
  test("ignores plain character keystrokes (captured via the field's change value)", () => {
    expect(shouldCaptureKey({ key: "a" })).toBe(false);
    expect(shouldCaptureKey({ key: "5" })).toBe(false);
  });
});

describe("buildCaptureStep — keydown records the key", () => {
  test("a keydown step carries type=keydown and the key", () => {
    document.body.innerHTML = '<input aria-label="Search">';
    const step = buildCaptureStep(document.querySelector("input")!, "keydown", () => 0, "Enter");
    expect(step.type).toBe("keydown");
    expect(step.key).toBe("Enter");
  });
});

/**
 * The shortcut case `shouldCaptureKey` deliberately opts into: without the
 * modifiers, Cmd+S records as a bare "s" and replay TYPES an "s" into the page
 * instead of saving. Capture is the only place that can see them.
 */
describe("buildCaptureStep — keydown records the modifiers (shortcut fidelity)", () => {
  function stepFor(mods: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }) {
    document.body.innerHTML = '<input aria-label="Search">';
    return buildCaptureStep(document.querySelector("input")!, "keydown", () => 0, "s", mods);
  }

  test("Ctrl+S records the Control modifier alongside the key", () => {
    const step = stepFor({ ctrlKey: true });
    expect(step.key).toBe("s");
    expect(step.modifiers).toEqual(["Control"]);
  });

  test("uses the canonical CDP/Playwright names (Meta, not Cmd)", () => {
    expect(stepFor({ metaKey: true }).modifiers).toEqual(["Meta"]);
  });

  test("multiple modifiers come out in a fixed order (Alt, Control, Meta, Shift)", () => {
    const step = stepFor({ shiftKey: true, ctrlKey: true, altKey: true, metaKey: true });
    expect(step.modifiers).toEqual(["Alt", "Control", "Meta", "Shift"]);
  });

  test("a plain Enter carries NO modifiers key (don't bloat every recording)", () => {
    document.body.innerHTML = '<input aria-label="Search">';
    const step = buildCaptureStep(document.querySelector("input")!, "keydown", () => 0, "Enter", {});
    expect("modifiers" in step).toBe(false);
  });

  test("a non-keydown action never records modifiers", () => {
    document.body.innerHTML = '<button aria-label="Save">Save</button>';
    const step = buildCaptureStep(document.querySelector("button")!, "click", () => 0, undefined, {
      ctrlKey: true,
    });
    expect("modifiers" in step).toBe(false);
  });
});
