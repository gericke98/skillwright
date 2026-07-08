// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { resolveElement } from "../src/index";

describe("resolveElement — same-origin iframe piercing", () => {
  test("finds an element inside a same-origin iframe by aria", () => {
    document.body.innerHTML = "<iframe></iframe>";
    const frame = document.querySelector("iframe")!;
    frame.contentDocument!.body.innerHTML = '<button aria-label="Pay now">x</button>';
    const el = resolveElement("aria/Pay now", document);
    expect(el).not.toBeNull();
    expect(el!.getAttribute("aria-label")).toBe("Pay now");
  });

  test("finds an element inside a same-origin iframe by text", () => {
    document.body.innerHTML = "<iframe></iframe>";
    const frame = document.querySelector("iframe")!;
    frame.contentDocument!.body.innerHTML = "<button>Submit payment</button>";
    expect(resolveElement("text/Submit payment", document)?.textContent).toBe("Submit payment");
  });

  test("does not crash when an iframe is inaccessible (cross-origin)", () => {
    document.body.innerHTML = '<iframe></iframe><button aria-label="Main">x</button>';
    const frame = document.querySelector("iframe")!;
    // Simulate a cross-origin frame: accessing contentDocument throws.
    Object.defineProperty(frame, "contentDocument", {
      get() {
        throw new Error("cross-origin");
      },
    });
    // still resolves the main-document element without throwing
    expect(resolveElement("aria/Main", document)).not.toBeNull();
  });
});
