import type { ReplayStep } from "./replay-step";

/** Thrown when a step needs a `{placeholder}` the caller didn't supply. */
export class MissingInputError extends Error {
  constructor(readonly names: string[]) {
    super(`missing required input(s): ${names.join(", ")}`);
    this.name = "MissingInputError";
  }
}

const PLACEHOLDER_RE = /\{([a-z0-9_]+)\}/gi;
/** `{secret}` is the redaction placeholder, not a user input — never required. */
const RESERVED = new Set(["secret"]);

function substitute(text: string, inputs: Record<string, string>, missing: Set<string>): string {
  return text.replace(PLACEHOLDER_RE, (full, rawName: string) => {
    const name = rawName;
    if (RESERVED.has(name.toLowerCase())) return full;
    if (Object.prototype.hasOwnProperty.call(inputs, name)) return inputs[name]!;
    missing.add(name);
    return full;
  });
}

/**
 * Substitute `{placeholder}` inputs into replay steps at run time (value, url,
 * and selectors). Throws MissingInputError listing every unfilled placeholder so
 * a run fails fast with a clear message instead of trying to act on a literal
 * `{invoice_number}`. The `{secret}` redaction placeholder is left untouched.
 */
export function applyInputs(steps: ReplayStep[], inputs: Record<string, string>): ReplayStep[] {
  const missing = new Set<string>();
  const out = steps.map((step) => {
    const next: ReplayStep = { ...step, selectors: step.selectors.map((s) => substitute(s, inputs, missing)) };
    if (typeof next.value === "string") next.value = substitute(next.value, inputs, missing);
    if (typeof next.url === "string") next.url = substitute(next.url, inputs, missing);
    return next;
  });
  if (missing.size > 0) throw new MissingInputError([...missing]);
  return out;
}
