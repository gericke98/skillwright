import { describe, expect, test, vi } from "vitest";
import { SchemaExhaustedError } from "@skillwright/shared";
import { createRelayBackend, type RelaySocket } from "../src/llm/relay-backend";

/**
 * A fake of the relay WebSocket. `respond` decides what the "CLI" sends back for
 * each generate message, so we can drive pairing, success, repair and failure
 * without a server.
 */
function fakeSocket(respond: (prompt: string, call: number) => unknown): {
  socket: RelaySocket;
  sent: unknown[];
} {
  const sent: unknown[] = [];
  let onMessage: ((data: string) => void) | undefined;
  let calls = 0;

  const socket: RelaySocket = {
    connect: async (onMsg) => {
      onMessage = onMsg;
    },
    send: (obj) => {
      sent.push(obj);
      const msg = obj as { kind: string; id: number; prompt?: string; token?: string };
      if (msg.kind === "pair") {
        onMessage?.(JSON.stringify({ kind: "paired", ok: true }));
        return;
      }
      if (msg.kind === "generate") {
        const reply = respond(msg.prompt!, ++calls);
        onMessage?.(JSON.stringify({ ...(reply as object), id: msg.id }));
      }
    },
    close: vi.fn(),
  };
  return { socket, sent };
}

const schema = {
  jsonSchema: {},
  validate: (v: any) => (v?.ok === true ? [] : ["expected {ok:true}"]),
};

describe("createRelayBackend — the panel borrows the CLI's brain", () => {
  test("pairs with the token, then generates over the socket", async () => {
    const { socket, sent } = fakeSocket(() => ({
      kind: "generated",
      ok: true,
      text: '{"ok":true}',
    }));
    const be = createRelayBackend({ port: 9333, token: "t0k", socket });

    const out = await be.complete<{ ok: boolean }>("hi", schema);

    expect(out.ok).toBe(true);
    expect(sent[0]).toMatchObject({ kind: "pair", token: "t0k" });
    expect(sent[1]).toMatchObject({ kind: "generate", prompt: "hi" });
  });

  test("NO api key is involved — the whole point", () => {
    const { socket } = fakeSocket(() => ({ kind: "generated", ok: true, text: "{}" }));
    const be = createRelayBackend({ port: 9333, token: "t0k", socket });
    expect(be.name).toBe("relay:cli");
    expect(JSON.stringify(be)).not.toContain("sk-");
  });

  test("pairs only ONCE across several completions (one socket, many prompts)", async () => {
    const { socket, sent } = fakeSocket(() => ({
      kind: "generated",
      ok: true,
      text: '{"ok":true}',
    }));
    const be = createRelayBackend({ port: 9333, token: "t0k", socket });

    await be.complete("one", schema);
    await be.complete("two", schema);

    expect(sent.filter((m) => (m as { kind: string }).kind === "pair")).toHaveLength(1);
    expect(sent.filter((m) => (m as { kind: string }).kind === "generate")).toHaveLength(2);
  });

  test("repairs a schema-invalid response by reprompting through the same channel", async () => {
    // First reply is junk; the repair round returns valid JSON.
    const { socket, sent } = fakeSocket((_p, call) => ({
      kind: "generated",
      ok: true,
      text: call === 1 ? '{"nope":1}' : '{"ok":true}',
    }));
    const be = createRelayBackend({ port: 9333, token: "t0k", socket });

    const out = await be.complete<{ ok: boolean }>("hi", schema);

    expect(out.ok).toBe(true);
    const generates = sent.filter((m) => (m as { kind: string }).kind === "generate");
    expect(generates.length).toBeGreaterThan(1);
    // The repair prompt carries the validation error back to the model.
    expect(JSON.stringify(generates[1])).toContain("expected {ok:true}");
  });

  test("gives up with SchemaExhaustedError rather than looping forever", async () => {
    const { socket } = fakeSocket(() => ({ kind: "generated", ok: true, text: "not json at all" }));
    const be = createRelayBackend({ port: 9333, token: "t0k", socket });
    await expect(be.complete("hi", schema)).rejects.toBeInstanceOf(SchemaExhaustedError);
  });

  test("a CLI-side failure surfaces as a real error (not a silent empty completion)", async () => {
    const { socket } = fakeSocket(() => ({
      kind: "generated",
      ok: false,
      error: "no agent CLI found on PATH",
    }));
    const be = createRelayBackend({ port: 9333, token: "t0k", socket });
    await expect(be.complete("hi", schema)).rejects.toThrow("no agent CLI found on PATH");
  });

  test("a rejected pairing fails loudly instead of hanging", async () => {
    const socket: RelaySocket = {
      connect: async (onMsg) => {
        // The server rejects the token the moment we pair.
        queueMicrotask(() => onMsg(JSON.stringify({ kind: "paired", ok: false, error: "invalid token" })));
      },
      send: () => {},
      close: vi.fn(),
    };
    const be = createRelayBackend({ port: 9333, token: "wrong", socket });
    await expect(be.complete("hi", schema)).rejects.toThrow(/invalid token/);
  });
});
