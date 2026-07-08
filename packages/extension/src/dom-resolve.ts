/**
 * Resolve a skillwright selector to an element within a document. Self-contained (no
 * imports, no outer-scope refs) so its `.toString()` can be injected into the
 * page via chrome.debugger `Runtime.evaluate` during relay replay — the same
 * logic then runs both in unit tests (happy-dom) and in the live page.
 *
 * Mirrors the capture side: `aria/<name>` → aria-label, `text/<text>` → a leaf
 * element whose trimmed text matches exactly, everything else → querySelector.
 * PIERCES open shadow DOM (web components) by searching every shadow root too.
 */
export function resolveElement(selector: string, doc: Document): Element | null {
  // Collect the document root plus every open shadow root (recursively) so the
  // search reaches elements inside web components.
  function allRoots(root: Document | ShadowRoot): Array<Document | ShadowRoot> {
    const roots: Array<Document | ShadowRoot> = [root];
    for (const el of Array.from(root.querySelectorAll("*"))) {
      const sr = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
      if (sr) roots.push(...allRoots(sr));
      // Same-origin iframes: descend into their document. Cross-origin frames
      // throw on access (a browser security boundary) — skip them.
      if (el.tagName === "IFRAME") {
        try {
          const idoc = (el as HTMLIFrameElement).contentDocument;
          if (idoc) roots.push(...allRoots(idoc));
        } catch {
          /* cross-origin — inaccessible */
        }
      }
    }
    return roots;
  }
  const roots = allRoots(doc);

  if (selector.startsWith("aria/")) {
    const name = selector.slice(5);
    for (const root of roots) {
      for (const el of Array.from(root.querySelectorAll("[aria-label]"))) {
        if (el.getAttribute("aria-label") === name) return el;
      }
    }
    return null;
  }
  if (selector.startsWith("text/")) {
    const text = selector.slice(5);
    for (const root of roots) {
      for (const el of Array.from(root.querySelectorAll("*"))) {
        if (el.children.length === 0 && el.textContent?.trim() === text) return el;
      }
    }
    return null;
  }
  try {
    for (const root of roots) {
      const found = root.querySelector(selector);
      if (found) return found;
    }
    return null;
  } catch {
    return null;
  }
}
