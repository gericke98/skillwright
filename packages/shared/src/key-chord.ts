/**
 * The keypress string Playwright's `press()` takes: modifiers, then the key,
 * joined with "+" ("Control+s"). Lives in shared because BOTH replay paths
 * need the same chord semantics — the `--cdp` Playwright driver presses this
 * string, and the relay derives its CDP modifier bitmask from the same
 * canonical, fixed-order names capture recorded.
 *
 * Pressing `step.key` alone (as the driver did before modifiers were
 * captured) turns a recorded Cmd+S into typing an "s".
 */
export function playwrightChord(key: string, modifiers: string[] = []): string {
  return [...modifiers, key].join("+");
}
