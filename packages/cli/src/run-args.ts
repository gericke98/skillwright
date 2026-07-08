/**
 * Parse a `--timeout <seconds>` flag off a `run` argv into milliseconds for the
 * step driver. Real-world apps (SPA route transitions, slow backends, AJAX
 * spinners) can exceed the driver's default per-step timeout; this lets a user
 * raise it without editing code.
 *
 * Returns `undefined` — meaning "keep the driver default" — for a missing,
 * non-numeric, zero, or negative value, so a bad flag never degrades every step
 * into an instant failure (0/negative) or a NaN timeout.
 */
export function parseTimeoutMs(argv: string[]): number | undefined {
  const i = argv.indexOf("--timeout");
  if (i < 0) return undefined;
  const seconds = Number(argv[i + 1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return seconds * 1000;
}
