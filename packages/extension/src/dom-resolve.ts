/**
 * Resolve a bskill selector to an element within a document. Self-contained (no
 * imports, no outer-scope refs) so its `.toString()` can be injected into the
 * page via chrome.debugger `Runtime.evaluate` during relay replay — the same
 * logic then runs both in unit tests (happy-dom) and in the live page.
 *
 * Mirrors the capture side: `aria/<name>` → aria-label, `text/<text>` → a leaf
 * element whose trimmed text matches exactly, everything else → querySelector.
 */
export function resolveElement(selector: string, doc: Document): Element | null {
  if (selector.startsWith("aria/")) {
    const name = selector.slice(5);
    const all = doc.querySelectorAll("[aria-label]");
    for (const el of Array.from(all)) {
      if (el.getAttribute("aria-label") === name) return el;
    }
    return null;
  }
  if (selector.startsWith("text/")) {
    const text = selector.slice(5);
    const all = doc.querySelectorAll("*");
    for (const el of Array.from(all)) {
      if (el.children.length === 0 && el.textContent?.trim() === text) return el;
    }
    return null;
  }
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}
