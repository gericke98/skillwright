import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Mint a pairing token. The relay shows it (side panel); the extension pins it
 * and presents it on connect. `gen` is injectable for deterministic tests;
 * production uses a cryptographically random 32-hex-char token.
 */
export function mintToken(gen: () => string = () => randomBytes(16).toString("hex")): string {
  return gen();
}

/**
 * Verify a presented token against the expected one. Constant-time compare, and
 * an empty or length-mismatched presented token is always rejected — no bypass.
 */
export function verifyToken(expected: string, presented: string): boolean {
  if (!expected || !presented) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
