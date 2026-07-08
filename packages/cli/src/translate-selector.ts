/**
 * A driver-agnostic locator descriptor. The Playwright adapter maps these to
 * `getByLabel` / `getByText` / `locator(css)`; keeping translation separate from
 * Playwright keeps it unit-testable without a browser.
 */
export interface LocatorDescriptor {
  kind: "label" | "text" | "css";
  value: string;
}

/**
 * Translate one skillwright selector string into a locator descriptor. Mirrors the
 * capture side: `aria/<name>` came from an aria-label, `text/<text>` from
 * visible text; everything else (test attributes, ids, CSS paths) is raw CSS.
 */
export function translateSelector(selector: string): LocatorDescriptor {
  const aria = selector.match(/^aria\/(.+)$/s);
  if (aria) return { kind: "label", value: aria[1]! };
  const text = selector.match(/^text\/(.+)$/s);
  if (text) return { kind: "text", value: text[1]! };
  return { kind: "css", value: selector };
}
