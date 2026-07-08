// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import { fillExpression } from "../src/relay-client";

beforeEach(() => {
  document.body.innerHTML = "";
});

/** The relay injects fillExpression() into the page and evaluates it. It's
 *  self-contained (inlines resolveElement), so we can eval it against a real DOM. */
function runFill(selector: string, value: string): boolean {
  // eslint-disable-next-line no-eval
  return eval(fillExpression(selector, value)) as boolean;
}

describe("fillExpression — relay-injected value setter", () => {
  test("drives a checkbox's .checked (not .value) from the boolean state", () => {
    document.body.innerHTML = `<input id="c" type="checkbox" value="on" />`;
    const box = document.getElementById("c") as HTMLInputElement;
    expect(runFill("#c", "true")).toBe(true);
    expect(box.checked).toBe(true);
    // Value attr must be left as the meaningful "on", not overwritten with "true".
    expect(box.value).toBe("on");
  });

  test("unchecks a checkbox when state is false", () => {
    document.body.innerHTML = `<input id="c" type="checkbox" checked />`;
    const box = document.getElementById("c") as HTMLInputElement;
    expect(runFill("#c", "false")).toBe(true);
    expect(box.checked).toBe(false);
  });

  test("still fills a text input's .value", () => {
    document.body.innerHTML = `<input id="t" type="text" />`;
    const t = document.getElementById("t") as HTMLInputElement;
    expect(runFill("#t", "hello")).toBe(true);
    expect(t.value).toBe("hello");
  });
});
