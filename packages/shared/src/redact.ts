/**
 * Secret redaction, shared by the extension's capture-time pass (D17, §5.2) and
 * the CLI distiller's second-pass net (§9). Runs BEFORE any value or URL is
 * written into a shareable artifact, so `recording.json` / `SKILL.md` are never
 * raw-with-secrets. Bias is intentionally toward over-redaction: a false
 * positive turns a value into a required input parameter (mildly annoying); a
 * false negative leaks a live credential into a shareable artifact.
 */

export const PLACEHOLDER = "{secret}";

/** Query/fragment-param names whose values are secret regardless of shape. */
const SENSITIVE_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "api_key",
  "apikey",
  "key",
  "secret",
  "client_secret",
  "password",
  "passwd",
  "pwd",
  "auth",
  "authorization",
  "session",
  "sessionid",
  "sid",
  "sig",
  "signature",
  "code",
]);

/** Well-known credential prefixes (matched anywhere a token starts). */
const SECRET_PREFIXES = [
  "sk-",
  "pk-",
  "sk_",
  "pk_",
  "ghp_",
  "gho_",
  "github_pat_",
  "xoxb-",
  "xoxp-",
  "akia",
  "asia",
  "aiza",
  "eyj", // JWT header
  "bearer ",
];

function isPlaceholder(value: string): boolean {
  return /^\{[a-z0-9_]*\}$/i.test(value);
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function isCardShaped(value: string): boolean {
  const digits = value.replace(/[\s-]/g, "");
  return /^\d{13,19}$/.test(digits) && luhnValid(digits);
}

/** Whether a SINGLE token (no whitespace) looks like a credential. */
function isSecretToken(token: string): boolean {
  const v = token.trim();
  const lower = v.toLowerCase();
  if (SECRET_PREFIXES.some((p) => lower.startsWith(p))) return true;
  // Long, high-entropy token: token-charset only, mixes letters and digits.
  if (v.length >= 20 && /^[A-Za-z0-9_\-.]+$/.test(v) && /[A-Za-z]/.test(v) && /\d/.test(v)) {
    return true;
  }
  return false;
}

/**
 * Whether a value contains a secret anywhere — the whole string, a card, or any
 * embedded token (so "Authorization: Bearer eyJ..." and "use key ghp_... now"
 * are caught, not just bare tokens).
 */
export function valueLooksSecret(value: string): boolean {
  if (isCardShaped(value)) return true;
  const lower = value.toLowerCase();
  if (SECRET_PREFIXES.some((p) => lower.includes(p))) return true;
  for (const token of value.split(/[\s,;]+/)) {
    if (token && (isSecretToken(token) || isCardShaped(token))) return true;
  }
  return false;
}

export interface FieldMeta {
  /** The input's `type` attribute, e.g. "password", "text", "email". */
  type?: string;
}

/**
 * Scrub secret-shaped tokens anywhere in a free-text blob (e.g. a request body),
 * token-wise so JSON/form structure survives. Over-redaction is the accepted bias.
 */
export function scrubSecrets(text: string): string {
  return text.replace(/[^\s"'`]+/g, (token) => (valueLooksSecret(token) ? PLACEHOLDER : token));
}

/** Redact a single captured field value. */
export function redactValue(value: string, meta: FieldMeta = {}): string {
  if (meta.type === "password") return PLACEHOLDER;
  if (isPlaceholder(value)) return value;
  return valueLooksSecret(value) ? PLACEHOLDER : value;
}

/** Redact a `key=value&...` param string (query or fragment form). */
function redactParamString(params: string): string {
  return params
    .split("&")
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq === -1) return part;
      const key = part.slice(0, eq);
      const rawValue = part.slice(eq + 1);
      let decoded = rawValue;
      try {
        decoded = decodeURIComponent(rawValue);
      } catch {
        /* keep raw */
      }
      const sensitive = SENSITIVE_KEYS.has(key.toLowerCase()) || valueLooksSecret(decoded);
      return sensitive ? `${key}=${PLACEHOLDER}` : part;
    })
    .join("&");
}

/** Redact secret-shaped segments in a URL path, preserving scheme + authority. */
function redactPathSegments(base: string): string {
  const m = base.match(/^([a-z][a-z0-9+.-]*:\/\/[^/]+)(\/.*)?$/i);
  if (!m) return base;
  const authority = m[1]!;
  const path = m[2] ?? "";
  const segs = path.split("/").map((seg) => {
    if (!seg) return seg;
    let decoded = seg;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      /* keep raw */
    }
    return valueLooksSecret(decoded) ? PLACEHOLDER : seg;
  });
  return authority + segs.join("/");
}

/**
 * Redact secrets across a URL's path, query, AND fragment (OAuth implicit-flow
 * tokens live in the fragment). Preserves non-sensitive structure and returns
 * the input unchanged if it is not a parseable URL (never throws).
 */
export function redactUrl(url: string): string {
  let rest = url;
  let fragment: string | null = null;
  let query: string | null = null;

  const h = rest.indexOf("#");
  if (h !== -1) {
    fragment = rest.slice(h + 1);
    rest = rest.slice(0, h);
  }
  const q = rest.indexOf("?");
  if (q !== -1) {
    query = rest.slice(q + 1);
    rest = rest.slice(0, q);
  }

  const newBase = redactPathSegments(rest);
  const newQuery = query === null ? "" : "?" + redactParamString(query);
  // Only treat a fragment as params when it carries key=value pairs; a plain
  // "#section" anchor is left alone.
  const newFragment =
    fragment === null ? "" : "#" + (fragment.includes("=") ? redactParamString(fragment) : fragment);

  return newBase + newQuery + newFragment;
}
