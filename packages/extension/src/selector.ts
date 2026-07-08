/**
 * Compute an ordered fallback stack of selectors for a captured element,
 * most-stable-first (§5.2): ARIA role+name → test attributes → id → visible
 * text → CSS path. Visible text is a stable, human-meaningful anchor that
 * survives layout changes; a deep positional `nth-of-type` CSS path is the most
 * brittle and is the last resort. The replay driver tries each in order; the
 * heal loop reasons over the same list. Stability order matters more than
 * completeness — a durable anchor early means fewer heals.
 */

const TEST_ATTRS = ["data-testid", "data-test", "data-qa", "data-cy"] as const;

function ariaSelector(el: Element): string | undefined {
  const name = el.getAttribute("aria-label")?.trim();
  return name ? `aria/${name}` : undefined;
}

function idSelector(el: Element): string | undefined {
  const id = el.getAttribute("id");
  if (id && /^[A-Za-z][\w-]*$/.test(id)) return `#${id}`;
  return undefined;
}

/** Stable attribute anchors for form fields that have no text/aria — a `name`
 * or a `placeholder` is far more durable than a positional CSS path. */
function attrSelector(el: Element, attr: string): string | undefined {
  const v = el.getAttribute(attr)?.trim();
  return v ? `[${attr}="${v}"]` : undefined;
}

function nthOfType(el: Element): number {
  let n = 1;
  let sib = el.previousElementSibling;
  while (sib) {
    if (sib.tagName === el.tagName) n++;
    sib = sib.previousElementSibling;
  }
  return n;
}

function cssPath(el: Element): string {
  const segments: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && node.tagName.toLowerCase() !== "body") {
    const tag = node.tagName.toLowerCase();
    segments.unshift(`${tag}:nth-of-type(${nthOfType(node)})`);
    node = node.parentElement;
  }
  return segments.join(" > ");
}

function textSelector(el: Element): string | undefined {
  const text = el.textContent?.trim();
  if (text && text.length <= 50 && !text.includes("\n")) return `text/${text}`;
  return undefined;
}

/** How many elements in `el`'s document a selector matches (aria/ and text/ are
 * not CSS, so they're counted structurally). Used to demote ambiguous selectors. */
function matchCount(el: Element, selector: string): number {
  const doc = el.ownerDocument;
  if (!doc) return 1;
  if (selector.startsWith("aria/")) {
    const name = selector.slice(5);
    let n = 0;
    for (const e of doc.querySelectorAll("[aria-label]")) {
      if (e.getAttribute("aria-label")?.trim() === name) n++;
    }
    return n;
  }
  if (selector.startsWith("text/")) {
    const text = selector.slice(5);
    let n = 0;
    for (const e of doc.querySelectorAll("button, a, [role], input, label")) {
      if (e.textContent?.trim() === text) n++;
    }
    return n || 1;
  }
  try {
    return doc.querySelectorAll(selector).length;
  } catch {
    return 2; // an invalid selector is treated as non-unique (demoted)
  }
}

export function computeSelectorStack(el: Element): string[] {
  const out: string[] = [];
  const push = (s: string | undefined) => {
    if (s && !out.includes(s)) out.push(s);
  };

  push(ariaSelector(el));
  for (const attr of TEST_ATTRS) {
    const v = el.getAttribute(attr);
    if (v) push(`[${attr}="${v}"]`);
  }
  push(idSelector(el));
  // Form-field anchors: name (most durable) then placeholder — for inputs that
  // have no text/aria of their own.
  push(attrSelector(el, "name"));
  push(attrSelector(el, "placeholder"));
  // Visible text ranks ABOVE the positional CSS path: text survives layout
  // changes, a deep nth-of-type path is the most brittle (last resort).
  push(textSelector(el));
  push(cssPath(el));

  // Uniqueness-aware ordering: a selector that matches MULTIPLE elements would
  // let the relay click the wrong one, so promote selectors that uniquely
  // identify the target and demote ambiguous ones (stable priority within each
  // group). The positional cssPath is unique by construction, so a unique
  // anchor always leads.
  const unique = out.filter((s) => matchCount(el, s) === 1);
  const ambiguous = out.filter((s) => !unique.includes(s));
  return [...unique, ...ambiguous];
}
