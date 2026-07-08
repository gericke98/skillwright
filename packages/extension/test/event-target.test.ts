// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { eventTarget } from "../src/index";

describe("eventTarget — real target through a shadow boundary", () => {
  test("returns the inner shadow element, not the retargeted host", () => {
    document.body.innerHTML = "<my-widget></my-widget>";
    const host = document.querySelector("my-widget")!;
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = '<button aria-label="Inner">x</button>';
    const inner = root.querySelector("button")!;

    let captured: Element | undefined;
    document.addEventListener("click", (e) => (captured = eventTarget(e)), true);
    inner.dispatchEvent(new Event("click", { bubbles: true, composed: true }));

    expect(captured).toBe(inner);
    expect(captured?.getAttribute("aria-label")).toBe("Inner");
  });

  test("returns event.target for a plain DOM element", () => {
    document.body.innerHTML = '<button aria-label="Plain">x</button>';
    const btn = document.querySelector("button")!;
    let captured: Element | undefined;
    document.addEventListener("click", (e) => (captured = eventTarget(e)), true);
    btn.dispatchEvent(new Event("click", { bubbles: true }));
    expect(captured).toBe(btn);
  });
});
