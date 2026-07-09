/**
 * Robust JSON extraction for agent-cli backends (§6.3). CLIs emit free text,
 * not schema-constrained JSON, so we scan for the first parse-valid JSON value:
 * fenced code blocks first (in document order), then balanced-bracket regions
 * pulled out of surrounding prose. Only objects and arrays count — a bare
 * number or string is never what the distiller asked for.
 */

function parseObjectOrArray(candidate: string): unknown | undefined {
  try {
    const value = JSON.parse(candidate);
    if (value !== null && typeof value === "object") return value;
  } catch {
    // not valid JSON — fall through
  }
  return undefined;
}

/**
 * From an opening bracket at `start`, return the index of its matching close,
 * respecting string literals and escapes so braces inside strings don't count.
 * Returns -1 if the region never balances (unterminated).
 */
function matchBalanced(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Candidate JSON strings in priority order: fenced blocks, then bare regions. */
function* candidates(raw: string): Generator<string> {
  const fence = /```[a-zA-Z0-9]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(raw)) !== null) yield m[1]!;

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c === "{" || c === "[") {
      const end = matchBalanced(raw, i);
      if (end !== -1) yield raw.slice(i, end + 1);
    }
  }
}

/**
 * Return the first parse-valid JSON object or array found in `raw`, or
 * `undefined` if there is none. Tolerates leading/trailing prose, fenced or
 * bare JSON, and skips malformed blocks in favour of a later valid one.
 */
export function extractFirstJson(raw: string): unknown | undefined {
  for (const candidate of candidates(raw)) {
    const parsed = parseObjectOrArray(candidate);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}
