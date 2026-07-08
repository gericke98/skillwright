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
