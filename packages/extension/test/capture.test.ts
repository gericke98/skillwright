// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import { buildCaptureStep } from "../src/index";

beforeEach(() => {
  document.body.innerHTML = "";
});

function el(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}

describe("buildCaptureStep — event → recording step (§5.2)", () => {
  test("a click on a delete control yields a destructive step with a selector stack", () => {
    const button = el(`<button aria-label="Delete invoice INV-001" data-testid="del">Delete</button>`);
    const step = buildCaptureStep(button, "click");
    expect(step.type).toBe("click");
    expect(step.effect).toBe("destructive");
    expect(step.selectors?.[0]).toEqual(["aria/Delete invoice INV-001"]);
    expect(step.value).toBeUndefined();
  });

  test("a change on a password field records a redacted value, tagged mutating", () => {
    const input = el(`<input type="password" aria-label="Password" value="hunter2" />`) as HTMLInputElement;
    const step = buildCaptureStep(input, "change");
    expect(step.effect).toBe("mutating");
    expect(step.value).toBe("{secret}");
  });

  test("a change on a plain field keeps a benign value", () => {
    const input = el(`<input type="text" aria-label="Amount" value="500" />`) as HTMLInputElement;
    const step = buildCaptureStep(input, "change");
    expect(step.value).toBe("500");
  });

  test("a change on a checkbox records the CHECKED STATE, not the value attr", () => {
    // The value attr of a checkbox ("on" by default) is meaningless for replay;
    // what matters is whether it ended up checked. Replay uses setChecked(state),
    // and fill()-ing a checkbox throws — so the value must be the boolean state.
    const box = el(`<input type="checkbox" aria-label="Agree" value="on" checked />`) as HTMLInputElement;
    const step = buildCaptureStep(box, "change");
    expect(step.value).toBe("true");

    const unchecked = el(`<input type="checkbox" aria-label="Agree" value="on" />`) as HTMLInputElement;
    expect(buildCaptureStep(unchecked, "change").value).toBe("false");
  });

  test("a change on a radio records the checked state", () => {
    const radio = el(`<input type="radio" aria-label="Card" value="card" checked />`) as HTMLInputElement;
    expect(buildCaptureStep(radio, "change").value).toBe("true");
  });

  test("a change on a contenteditable records its text (rich-text editors)", () => {
    // Gmail/Slack/Notion editors are contenteditable divs — no form `value`, and
    // they fire `input`, not `change`. Capture must record the typed text so
    // replay (fill() supports contenteditable) can reproduce it.
    const editor = el(`<div contenteditable="true" aria-label="Message body">Hello team</div>`);
    const step = buildCaptureStep(editor, "change");
    expect(step.value).toBe("Hello team");
  });

  test("a contenteditable's text is redacted like any other field", () => {
    const editor = el(`<div contenteditable="true" aria-label="Notes">token sk-abcdef0123456789abcdef</div>`);
    const step = buildCaptureStep(editor, "change");
    expect(step.value).not.toContain("sk-abcdef0123456789abcdef");
  });

  test("a file input becomes a required {file} runtime input, never a fake path", () => {
    // A browser hides the real path behind "C:\fakepath\..." — useless and
    // unreplayable across machines. Capture parameterizes it: replay demands the
    // file via --input file=<path> and uses setInputFiles. Never a literal path.
    const input = el(`<input type="file" aria-label="Attach receipt" />`) as HTMLInputElement;
    const step = buildCaptureStep(input, "change");
    expect(step.value).toBe("{file}");
  });

  test("selectors are wrapped as string[][] to match the recording schema", () => {
    const button = el(`<button aria-label="Go" id="g1">Go</button>`);
    const step = buildCaptureStep(button, "click");
    expect(Array.isArray(step.selectors)).toBe(true);
    for (const group of step.selectors!) {
      expect(Array.isArray(group)).toBe(true);
    }
  });
});
