/**
 * Wire protocol for the direct command relay (design B). The CLI hosts a
 * localhost WebSocket; the extension connects out, pairs with a token, and
 * performs each replay step as a TRUSTED chrome.debugger action. Deliberately
 * high-level (perform/result) rather than raw CDP frames.
 */

/** extension → relay: first message after connecting. */
export interface PairMessage {
  kind: "pair";
  token: string;
}

/** relay → extension: pairing accepted / rejected. */
export interface PairedMessage {
  kind: "paired";
  ok: boolean;
  error?: string;
}

/** relay → extension: perform one step attempt with one selector. */
export interface PerformMessage {
  kind: "perform";
  id: number;
  action: string;
  selector: string;
  value?: string;
}

/** extension → relay: the outcome of a perform. */
export interface ResultMessage {
  kind: "result";
  id: number;
  ok: boolean;
  error?: string;
}

export type FromExtension = PairMessage | ResultMessage;
export type ToExtension = PairedMessage | PerformMessage;

/** Parse a JSON wire message defensively; returns null on malformed input. */
export function parseMessage<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
