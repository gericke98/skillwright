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
  // Visible text ranks ABOVE the positional CSS path: text survives layout
  // changes, a deep nth-of-type path is the most brittle (last resort).
  push(textSelector(el));
  push(cssPath(el));

  return out;
}
