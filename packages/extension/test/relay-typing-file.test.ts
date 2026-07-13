// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  elementKindExpression,
  focusAndSelectAllExpression,
  performStep,
} from "../src/relay-client";

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** The relay injects these expressions and evaluates them in the page; they're
 *  self-contained, so eval against a real DOM is a faithful test. */
const run = (expr: string): unknown => eval(expr);

describe("elementKindExpression — replay strategy per element", () => {
  test("classifies each control by how it must be driven", () => {
    document.body.innerHTML = `
      <input id="t" type="text" />
      <input id="f" type="file" />
      <input id="c" type="checkbox" />
      <input id="r" type="radio" />
      <select id="s"><option>a</option></select>
      <div id="ed" contenteditable="true"></div>
      <textarea id="ta"></textarea>`;
    expect(run(elementKindExpression("#t"))).toBe("text");
    expect(run(elementKindExpression("#f"))).toBe("file");
    expect(run(elementKindExpression("#c"))).toBe("toggle");
    expect(run(elementKindExpression("#r"))).toBe("toggle");
    expect(run(elementKindExpression("#s"))).toBe("select");
    expect(run(elementKindExpression("#ed"))).toBe("text");
    expect(run(elementKindExpression("#ta"))).toBe("text");
  });

  test("returns null for a missing element", () => {
    expect(run(elementKindExpression("#nope"))).toBeNull();
  });
});

describe("focusAndSelectAllExpression — insertText must REPLACE, not append", () => {
  test("focuses and selects the existing value of a text input", () => {
    document.body.innerHTML = `<input id="t" type="text" value="old value" />`;
    const input = document.getElementById("t") as HTMLInputElement;
    expect(run(focusAndSelectAllExpression("#t"))).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("old value".length);
  });

  test("returns false (never throws) for a missing element", () => {
    expect(run(focusAndSelectAllExpression("#nope"))).toBe(false);
  });
});

/** A fake CdpSend that records every command and replays scripted eval results. */
function fakeSend(evalResults: unknown[]) {
  const sent: { method: string; params: any }[] = [];
  let evalCall = 0;
  const send = vi.fn(async (method: string, params: any) => {
    sent.push({ method, params });
    if (method === "Runtime.evaluate") {
      const result = evalResults[evalCall++];
      // returnByValue:false is the objectId path (file inputs).
      return params.returnByValue === false
        ? { result: { objectId: result } }
        : { result: { value: result } };
    }
    return {};
  });
  return { send, sent };
}

describe("performStep — text fields are TYPED, not assigned", () => {
  test("a text change focuses+selects, then dispatches Input.insertText", async () => {
    // eval order: elementKind -> "text", focusAndSelectAll -> true
    const { send, sent } = fakeSend(["text", true]);
    const res = await performStep({ action: "change", selector: "#t", value: "hello" }, send);
    expect(res.ok).toBe(true);

    const insert = sent.find((s) => s.method === "Input.insertText");
    expect(insert).toBeDefined();
    expect(insert!.params.text).toBe("hello");
    // The old .value-assignment path (invisible to React) must be gone.
    expect(sent.some((s) => s.method === "Runtime.evaluate" && /el\.value =/.test(s.params.expression))).toBe(
      false,
    );
  });

  test("a missing element fails cleanly without dispatching input", async () => {
    const { send, sent } = fakeSend([null]);
    const res = await performStep({ action: "change", selector: "#gone", value: "x" }, send);
    expect(res).toEqual({ ok: false, error: "element not found" });
    expect(sent.some((s) => s.method === "Input.insertText")).toBe(false);
  });
});

describe("performStep — file inputs go through CDP (page JS can't set them)", () => {
  test("resolves the element by reference and calls DOM.setFileInputFiles", async () => {
    // eval order: elementKind -> "file", then the objectId resolve.
    const { send, sent } = fakeSend(["file", "OBJ-123"]);
    const res = await performStep({ action: "change", selector: "#f", value: "/tmp/a.pdf" }, send);
    expect(res.ok).toBe(true);

    const setFiles = sent.find((s) => s.method === "DOM.setFileInputFiles");
    expect(setFiles).toBeDefined();
    expect(setFiles!.params).toMatchObject({ objectId: "OBJ-123", files: ["/tmp/a.pdf"] });
  });

  test("this closes the v1 relay gap: a file step no longer fails outright", async () => {
    const { send, sent } = fakeSend(["file", "OBJ-9"]);
    const res = await performStep({ action: "change", selector: "#f", value: "/tmp/b.png" }, send);
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
    expect(sent.some((s) => s.method === "DOM.setFileInputFiles")).toBe(true);
  });
});

describe("performStep — toggles and selects keep the JS state path", () => {
  test("a checkbox is driven through the injected fill expression, not insertText", async () => {
    // eval order: elementKind -> "toggle", fillExpression -> true
    const { send, sent } = fakeSend(["toggle", true]);
    const res = await performStep({ action: "change", selector: "#c", value: "true" }, send);
    expect(res.ok).toBe(true);
    expect(sent.some((s) => s.method === "Input.insertText")).toBe(false);
  });
});
