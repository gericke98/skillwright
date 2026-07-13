/**
 * An LlmBackend that borrows the LOCAL CLI's brain over the relay WebSocket.
 *
 * Why this exists: the BYO-key backend puts the user's API key in
 * `chrome.storage.local` and calls a provider straight from the browser. This
 * one sends the prompt to `skillwright serve` on localhost, which answers using
 * the backend the CLI already has — the user's existing `claude`/`codex` auth.
 * So: **no API key in the browser, none to create, and nothing sent anywhere the
 * user's agent CLI wasn't already sending it.** For a tool whose whole pitch is
 * capturing your real authenticated work, that's the right default.
 *
 * The schema never crosses the wire — `SchemaSpec.validate` is a function. Only
 * prompt→text travels; extraction, validation and the repair reprompt all stay
 * here, exactly as they do for the fetch backend.
 */
import {
  completeWithRepair,
  type LlmBackend,
  type SchemaSpec,
} from "@skillwright/shared";

/** Text-mode structure is unreliable, so the same budget the CLI's agent-cli
 *  backend uses (§6.3) — higher than the api backend's 1. */
const MAX_ATTEMPTS = 3;
const GENERATE_TIMEOUT_MS = 120_000;

/** The socket seam — injected in tests, a real WebSocket in the panel. */
export interface RelaySocket {
  connect(onMessage: (data: string) => void): Promise<void>;
  send(obj: unknown): void;
  close(): void;
}

export interface RelayBackendConfig {
  port: number;
  token: string;
  /** Injected in tests; defaults to a real localhost WebSocket. */
  socket?: RelaySocket;
}

interface GeneratedReply {
  kind: string;
  id: number;
  ok: boolean;
  text?: string;
  error?: string;
}

function defaultSocket(port: number): RelaySocket {
  let ws: WebSocket | undefined;
  return {
    connect(onMessage) {
      return new Promise<void>((resolve, reject) => {
        ws = new WebSocket(`ws://127.0.0.1:${port}`);
        ws.addEventListener("message", (ev) => onMessage(String((ev as MessageEvent).data)));
        ws.addEventListener("open", () => resolve(), { once: true });
        ws.addEventListener(
          "error",
          () => reject(new Error(`could not reach skillwright serve on port ${port}`)),
          { once: true },
        );
      });
    },
    send(obj) {
      ws?.send(JSON.stringify(obj));
    },
    close() {
      ws?.close();
    },
  };
}

export function createRelayBackend(cfg: RelayBackendConfig): LlmBackend {
  const socket = cfg.socket ?? defaultSocket(cfg.port);

  let nextId = 0;
  const pending = new Map<number, { resolve(text: string): void; reject(e: Error): void }>();
  /** Pairing happens once, lazily, and is shared by every later completion. */
  let paired: Promise<void> | undefined;
  let pairSettle: { resolve(): void; reject(e: Error): void } | undefined;

  function onMessage(data: string): void {
    let msg: GeneratedReply;
    try {
      msg = JSON.parse(data) as GeneratedReply;
    } catch {
      return; // malformed frame — ignore rather than take the panel down
    }
    if (msg.kind === "paired") {
      if (msg.ok) pairSettle?.resolve();
      else pairSettle?.reject(new Error(msg.error ?? "relay rejected the pairing token"));
      return;
    }
    if (msg.kind === "generated") {
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      if (msg.ok) waiter.resolve(msg.text ?? "");
      // A CLI-side failure (no agent binary, backend threw) must surface as an
      // error — never as an empty completion the repair loop would misread as
      // "the model said nothing useful".
      else waiter.reject(new Error(msg.error ?? "the relay could not generate a completion"));
    }
  }

  function ensurePaired(): Promise<void> {
    if (paired) return paired;
    paired = (async () => {
      await new Promise<void>((resolve, reject) => {
        pairSettle = { resolve, reject };
        void socket.connect(onMessage).then(
          () => socket.send({ kind: "pair", token: cfg.token }),
          (e: unknown) => reject(e instanceof Error ? e : new Error(String(e))),
        );
      });
    })();
    // A failed pairing must not be cached as a permanent state — let the user
    // fix the token and retry.
    paired.catch(() => {
      paired = undefined;
    });
    return paired;
  }

  const generate = async (prompt: string): Promise<string> => {
    await ensurePaired();
    const id = ++nextId;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("the local CLI did not answer in time"));
      }, GENERATE_TIMEOUT_MS);
      pending.set(id, {
        resolve: (text) => {
          clearTimeout(timer);
          resolve(text);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      socket.send({ kind: "generate", id, prompt });
    });
  };

  return {
    name: "relay:cli",
    complete<T>(prompt: string, schema: SchemaSpec<T>): Promise<T> {
      return completeWithRepair(generate, prompt, schema, MAX_ATTEMPTS);
    },
  };
}
