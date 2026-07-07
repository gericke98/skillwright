/**
 * Capture-time secret redaction (D17). Runs in the content script BEFORE any
 * value or URL is written into the recording, so `recording.json` is never
 * raw-with-secrets. Bias is intentionally toward over-redaction: a false
 * positive turns a value into a required input parameter (mildly annoying); a
 * false negative leaks a live credential into a shareable artifact.
 */

export const PLACEHOLDER = "{secret}";

/** Query-param names whose values are treated as secret regardless of shape. */
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

/** Well-known credential prefixes. */
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

function isSecretShaped(value: string): boolean {
  const v = value.trim();
  const lower = v.toLowerCase();
  if (SECRET_PREFIXES.some((p) => lower.startsWith(p))) return true;
  // Long, high-entropy token: token-charset only, mixes letters and digits.
  if (v.length >= 20 && /^[A-Za-z0-9_\-.]+$/.test(v) && /[A-Za-z]/.test(v) && /\d/.test(v)) {
    return true;
  }
  return false;
}

export interface FieldMeta {
  /** The input's `type` attribute, e.g. "password", "text", "email". */
  type?: string;
}

/** Redact a single captured field value. */
export function redactValue(value: string, meta: FieldMeta = {}): string {
  if (meta.type === "password") return PLACEHOLDER;
  if (isPlaceholder(value)) return value;
  if (isCardShaped(value)) return PLACEHOLDER;
  if (isSecretShaped(value)) return PLACEHOLDER;
  return value;
}

/**
 * Redact secrets in a URL's query string, preserving all non-sensitive
 * structure byte-for-byte. Returns the input unchanged if it has no query or
 * cannot be parsed (never throws).
 */
export function redactUrl(url: string): string {
  const qIndex = url.indexOf("?");
  if (qIndex === -1) return url;

  const base = url.slice(0, qIndex);
  let query = url.slice(qIndex + 1);
  let hash = "";
  const hIndex = query.indexOf("#");
  if (hIndex !== -1) {
    hash = query.slice(hIndex);
    query = query.slice(0, hIndex);
  }

  const parts = query.split("&").map((part) => {
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
    const sensitive =
      SENSITIVE_KEYS.has(key.toLowerCase()) || isSecretShaped(decoded) || isCardShaped(decoded);
    return sensitive ? `${key}=${PLACEHOLDER}` : part;
  });

  return `${base}?${parts.join("&")}${hash}`;
}
