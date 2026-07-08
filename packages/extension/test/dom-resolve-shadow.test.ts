// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { resolveElement } from "../src/index";

/** Attach an open shadow root with the given HTML and return the host. */
function withShadow(hostHtml, shadowHtml) {
  document.body.innerHTML = hostHtml;
  const host = document.body.firstElementChild;
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = shadowHtml;
  return host;
}

describe("resolveElement — shadow DOM piercing (web components)", () => {
  test("finds an element inside an open shadow root by aria-label", () => {
    withShadow("<my-widget></my-widget>", '<button aria-label="Delete row">x</button>');
    const el = resolveElement("aria/Delete row", document);
    expect(el).not.toBeNull();
    expect(el.getAttribute("aria-label")).toBe("Delete row");
  });

  test("finds an element inside a shadow root by text", () => {
    withShadow("<my-panel></my-panel>", "<span><button>Save</button></span>");
    const el = resolveElement("text/Save", document);
    expect(el?.textContent).toBe("Save");
  });

  test("finds an element inside a shadow root by CSS", () => {
    withShadow("<my-form></my-form>", '<input class="email" />');
    const el = resolveElement(".email", document);
    expect(el).not.toBeNull();
  });

  test("finds an element in a NESTED shadow root", () => {
    document.body.innerHTML = "<outer-el></outer-el>";
    const outer = document.body.firstElementChild.attachShadow({ mode: "open" });
    outer.innerHTML = "<inner-el></inner-el>";
    const inner = outer.firstElementChild.attachShadow({ mode: "open" });
    inner.innerHTML = '<button aria-label="Deep">x</button>';
    expect(resolveElement("aria/Deep", document)).not.toBeNull();
  });

  test("still resolves ordinary light-DOM elements (regression)", () => {
    document.body.innerHTML = '<button aria-label="Light">x</button>';
    expect(resolveElement("aria/Light", document)).not.toBeNull();
  });
});
