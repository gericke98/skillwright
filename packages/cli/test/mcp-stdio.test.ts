import { describe, expect, test } from "vitest";
import { PassThrough } from "node:stream";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startMcpServer } from "../src/mcp/stdio";

function libWithSkill(): string {
  const lib = mkdtempSync(join(tmpdir(), "sw-mcp-io-"));
  mkdirSync(join(lib, "ship-order"), { recursive: true });
  writeFileSync(join(lib, "ship-order", "SKILL.md"), "---\nname: ship-order\ndescription: Ships an order.\n---\n");
  return lib;
}

describe("startMcpServer — NDJSON JSON-RPC over stdio", () => {
  test("responds to initialize → tools/list → tools/call over a stream", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on("data", (c) => chunks.push(c.toString()));

    const done = startMcpServer({
      input,
      output,
      libraryDir: libWithSkill(),
      runSkill: async () => ({ status: "ok" }),
    });

    input.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
    input.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    input.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
    input.write(
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ship-order", arguments: {} } }) + "\n",
    );
    input.end();
    await done;

    const responses = chunks.join("").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    // notification produced no response → exactly 3 responses for 3 requests-with-id
    expect(responses).toHaveLength(3);
    expect(responses.find((r) => r.id === 1).result.serverInfo.name).toBe("skillwright");
    expect(responses.find((r) => r.id === 2).result.tools[0].name).toBe("ship-order");
    expect(responses.find((r) => r.id === 3).result.isError).toBeFalsy();
  });
});
