import { WebSocketServer, type WebSocket } from "ws";
import { verifyToken } from "./token";
import {
  parseMessage,
  type FromExtension,
  type GenerateMessage,
  type GeneratedMessage,
  type PerformMessage,
  type PairedMessage,
} from "./relay-protocol";
import type { PerformRequest, PerformResult, RelayTransport } from "./relay-driver";

export interface RelayServerOptions {
  token: string;
  /** 0 = ephemeral free port. */
  port?: number;
  /** Per-perform timeout (ms). */
  performTimeoutMs?: number;
  /**
   * Raw text completion for `generate` requests from the extension. When set
   * (i.e. `skillwright serve`), the panel can compile skills using the CLI's own
   * backend — the user's existing claude/codex auth — instead of a BYO key in
   * browser storage. Unset (i.e. `run --relay`) means generate requests are
   * refused: a replay session is not an LLM endpoint.
   */
  onGenerate?: (prompt: string) => Promise<string>;
}

/**
 * The CLI-hosted relay: a localhost WebSocket the extension connects OUT to.
 * The extension pairs with the token, then executes perform commands as trusted
 * chrome.debugger actions. Exposes a `transport` the RelayStepDriver drives.
 */
export class WsRelayServer {
  private wss?: WebSocketServer;
  private ext?: WebSocket;
  private nextId = 0;
  private readonly pending = new Map<number, (r: PerformResult) => void>();
  private extResolvers: Array<() => void> = [];
  readonly port: number;

  constructor(private readonly opts: RelayServerOptions) {
    this.port = opts.port ?? 0;
  }

  start(): Promise<{ port: number; url: string }> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ host: "127.0.0.1", port: this.port });
      this.wss.on("connection", (ws) => this.onConnection(ws));
      this.wss.on("listening", () => {
        const addr = this.wss!.address();
        const port = typeof addr === "object" && addr ? addr.port : this.port;
        resolve({ port, url: `ws://127.0.0.1:${port}` });
      });
    });
  }

  /** Resolves once a valid extension has paired. */
  waitForExtension(): Promise<void> {
    if (this.ext) return Promise.resolve();
    return new Promise((resolve) => this.extResolvers.push(resolve));
  }

  private onConnection(ws: WebSocket): void {
    let paired = false;
    ws.on("message", (data) => {
      const msg = parseMessage<FromExtension>(data.toString());
      if (!msg) return;
      if (!paired) {
        if (msg.kind === "pair" && verifyToken(this.opts.token, msg.token)) {
          paired = true;
          this.ext = ws;
          this.send(ws, { kind: "paired", ok: true });
          this.extResolvers.splice(0).forEach((r) => r());
        } else {
          this.send(ws, { kind: "paired", ok: false, error: "invalid token" } satisfies PairedMessage);
          ws.close();
        }
        return;
      }
      if (msg.kind === "result") {
        const resolver = this.pending.get(msg.id);
        if (resolver) {
          this.pending.delete(msg.id);
          resolver({ ok: msg.ok, error: msg.error, url: msg.url, aria: msg.aria });
        }
        return;
      }
      if (msg.kind === "generate") {
        void this.onGenerateMessage(ws, msg);
      }
    });
    ws.on("close", () => {
      if (this.ext === ws) this.ext = undefined;
    });
  }

  /**
   * Answer a paired extension's `generate` with the CLI's own LLM backend.
   *
   * Only reachable AFTER pairing (the caller checks), so an unauthenticated
   * localhost page can't turn a running relay into a free LLM proxy. Refused
   * outright unless `onGenerate` was provided — `run --relay` is a replay
   * session, not an LLM endpoint.
   */
  private async onGenerateMessage(ws: WebSocket, msg: GenerateMessage): Promise<void> {
    if (!this.opts.onGenerate) {
      this.send(ws, {
        kind: "generated",
        id: msg.id,
        ok: false,
        error: "this relay does not serve LLM requests — start `skillwright serve`",
      } satisfies GeneratedMessage);
      return;
    }
    try {
      const text = await this.opts.onGenerate(msg.prompt);
      this.send(ws, { kind: "generated", id: msg.id, ok: true, text } satisfies GeneratedMessage);
    } catch (e) {
      this.send(ws, {
        kind: "generated",
        id: msg.id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      } satisfies GeneratedMessage);
    }
  }

  private send(ws: WebSocket, obj: unknown): void {
    ws.send(JSON.stringify(obj));
  }

  readonly transport: RelayTransport = {
    send: (req: PerformRequest): Promise<PerformResult> => {
      if (!this.ext) return Promise.resolve({ ok: false, error: "no extension connected" });
      const id = ++this.nextId;
      const perform: PerformMessage = { kind: "perform", id, ...req };
      const timeoutMs = this.opts.performTimeoutMs ?? 10000;
      return new Promise<PerformResult>((resolve) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          resolve({ ok: false, error: "perform timed out" });
        }, timeoutMs);
        this.pending.set(id, (r) => {
          clearTimeout(timer);
          resolve(r);
        });
        this.send(this.ext!, perform);
      });
    },
  };

  async close(): Promise<void> {
    this.ext?.close();
    await new Promise<void>((resolve) => {
      if (!this.wss) return resolve();
      this.wss.close(() => resolve());
    });
  }
}
