import { describe, expect, test } from "vitest";
import { playwrightChord } from "@skillwright/shared";
import { keyDispatchEvents, keyEventFields, modifierMask } from "../src/relay-client";

describe("keyEventFields — CDP key event fidelity", () => {
  test("Enter carries text \\r (without it, forms don't submit)", () => {
    expect(keyEventFields("Enter")).toEqual({
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      text: "\r",
    });
  });

  test("Escape and Tab get their virtual key codes, no text", () => {
    expect(keyEventFields("Escape")).toMatchObject({ code: "Escape", windowsVirtualKeyCode: 27 });
    expect(keyEventFields("Escape").text).toBeUndefined();
    expect(keyEventFields("Tab")).toMatchObject({ code: "Tab", windowsVirtualKeyCode: 9 });
  });

  test("arrows map to their virtual key codes", () => {
    expect(keyEventFields("ArrowDown").windowsVirtualKeyCode).toBe(40);
    expect(keyEventFields("ArrowUp").windowsVirtualKeyCode).toBe(38);
    expect(keyEventFields("ArrowLeft").windowsVirtualKeyCode).toBe(37);
    expect(keyEventFields("ArrowRight").windowsVirtualKeyCode).toBe(39);
  });

  test("`code` is PHYSICAL and distinct from the logical `key` for characters", () => {
    // The bug this pins: code:"s" is not a real physical code — Chrome expects
    // "KeyS". A shortcut dispatched with code:"s" is ignored by many apps.
    const s = keyEventFields("s");
    expect(s.key).toBe("s");
    expect(s.code).toBe("KeyS");
    expect(s.windowsVirtualKeyCode).toBe(83); // 'S'
  });

  test("digits map to Digit<N> physical codes", () => {
    expect(keyEventFields("1")).toMatchObject({ key: "1", code: "Digit1", windowsVirtualKeyCode: 49 });
  });

  test("an unknown key degrades safely rather than throwing", () => {
    const out = keyEventFields("F13");
    expect(out.key).toBe("F13");
    expect(out.windowsVirtualKeyCode).toBe(0);
  });
});

describe("modifierMask — CDP bitmask (Alt=1, Ctrl=2, Meta=4, Shift=8)", () => {
  test("no modifiers is 0", () => {
    expect(modifierMask()).toBe(0);
    expect(modifierMask([])).toBe(0);
  });

  test("single modifiers map to their bits", () => {
    expect(modifierMask(["Alt"])).toBe(1);
    expect(modifierMask(["Control"])).toBe(2);
    expect(modifierMask(["Meta"])).toBe(4);
    expect(modifierMask(["Shift"])).toBe(8);
  });

  test("combinations OR together", () => {
    expect(modifierMask(["Control", "Shift"])).toBe(10);
    expect(modifierMask(["Alt", "Control", "Meta", "Shift"])).toBe(15);
  });

  test("an unknown modifier contributes nothing (never NaN)", () => {
    expect(modifierMask(["Hyper" as never, "Control"])).toBe(2);
  });
});

describe("keyDispatchEvents — the Input.dispatchKeyEvent sequence", () => {
  test("a plain Enter is keyDown(text=\\r) + keyUp — text is what submits the form", () => {
    const events = keyDispatchEvents("Enter");
    expect(events.map((e) => e.type)).toEqual(["keyDown", "keyUp"]);
    expect(events[0]!.text).toBe("\r");
    expect(events[0]!.modifiers).toBe(0);
  });

  test("a non-text key (Escape) dispatches rawKeyDown, not keyDown", () => {
    expect(keyDispatchEvents("Escape").map((e) => e.type)).toEqual(["rawKeyDown", "keyUp"]);
  });

  test("Ctrl+S is a SHORTCUT: text is dropped so it never types an 's' into the page", () => {
    const [down] = keyDispatchEvents("s", ["Control"]);
    expect(down!.type).toBe("rawKeyDown");
    expect(down!.text).toBeUndefined();
    expect(down!.modifiers).toBe(2);
    expect(down!.code).toBe("KeyS");
  });

  test("Shift is exempt — Shift+Enter still carries its text (it genuinely inserts)", () => {
    const [down] = keyDispatchEvents("Enter", ["Shift"]);
    expect(down!.text).toBe("\r");
    expect(down!.type).toBe("keyDown");
    expect(down!.modifiers).toBe(8);
  });

  test("Ctrl+Shift+Enter is still a shortcut (a non-Shift modifier is present)", () => {
    const [down] = keyDispatchEvents("Enter", ["Control", "Shift"]);
    expect(down!.text).toBeUndefined();
    expect(down!.modifiers).toBe(10);
  });

  test("keyUp carries the same fields as the down event", () => {
    const [down, up] = keyDispatchEvents("s", ["Meta"]);
    expect(up!.type).toBe("keyUp");
    expect(up!.code).toBe(down!.code);
    expect(up!.modifiers).toBe(down!.modifiers);
  });
});

describe("playwrightChord — the --cdp driver's press() string", () => {
  test("a bare key stays bare", () => {
    expect(playwrightChord("Enter")).toBe("Enter");
    expect(playwrightChord("Enter", [])).toBe("Enter");
  });

  test("modifiers join with + in the canonical order", () => {
    expect(playwrightChord("s", ["Control"])).toBe("Control+s");
    expect(playwrightChord("k", ["Meta", "Shift"])).toBe("Meta+Shift+k");
  });
});
