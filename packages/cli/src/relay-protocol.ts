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
  key?: string;
  /** Modifiers held for a keydown. Without these a captured Cmd+S replays as
   *  typing an "s" — the wire has to carry them, not just the key. */
  modifiers?: string[];
}

/**
 * extension → relay: run this prompt through the CLI's own LLM backend.
 *
 * Only the PROMPT crosses the wire, never the schema: a `SchemaSpec.validate` is
 * a function. The extension keeps the schema, validates the returned text, and
 * reprompts through this same channel on a mismatch.
 */
export interface GenerateMessage {
  kind: "generate";
  id: number;
  prompt: string;
}

/** relay → extension: the raw completion (or why there isn't one). */
export interface GeneratedMessage {
  kind: "generated";
  id: number;
  ok: boolean;
  text?: string;
  error?: string;
}

/** extension → relay: the outcome of a perform. */
export interface ResultMessage {
  kind: "result";
  id: number;
  ok: boolean;
  error?: string;
  /** For a "snapshot" perform: the live page view (heal over the relay). */
  url?: string;
  aria?: string;
}

export type FromExtension = PairMessage | ResultMessage | GenerateMessage;
export type ToExtension = PairedMessage | PerformMessage | GeneratedMessage;

/** Parse a JSON wire message defensively; returns null on malformed input. */
export function parseMessage<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
