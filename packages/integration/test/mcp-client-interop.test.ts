import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * The real "consumable by any agent" proof: drive a SPAWNED `skillwright mcp`
 * process with the OFFICIAL MCP SDK client (the same library OpenAI / Claude /
 * LangGraph / Cursor use). This exercises real protocol-version negotiation and
 * the exact wire contract a third-party client expects — beyond the hand-rolled
 * NDJSON unit test. No browser needed: tools/call degrades gracefully with no
 * CDP endpoint, so we can validate the full initialize → list → call round-trip.
 */
const CLI_BIN = resolve(__dirname, "../../cli/src/bin.ts");

function libWithSkill(): string {
  const lib = mkdtempSync(join(tmpdir(), "sw-mcp-interop-"));
  const dir = join(lib, "ship-order");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    "---\nname: ship-order\ndescription: Ships an order to a customer.\n---\n\nShip it.\n",
  );
  return lib;
}

let client: Client;

beforeAll(async () => {
  const transport = new StdioClientTransport({
    command: process.execPath, // node
    args: ["--import", "tsx", CLI_BIN, "mcp"],
    env: { ...process.env, SKILLWRIGHT_HOME: libWithSkill(), CHROME_CDP_URL: "" },
  });
  client = new Client({ name: "interop-test", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport); // performs the initialize handshake + version negotiation
}, 30000);

afterAll(async () => {
  await client?.close();
});

describe("skillwright mcp — official MCP SDK client interop", () => {
  test("the official client negotiates initialize and sees the server", () => {
    const info = client.getServerVersion();
    expect(info?.name).toBe("skillwright");
  });

  test("listTools exposes each installed skill as a callable tool", async () => {
    const { tools } = await client.listTools();
    const ship = tools.find((t) => t.name === "ship-order");
    expect(ship).toBeTruthy();
    expect(ship!.description).toContain("Ships an order");
    expect(ship!.inputSchema.type).toBe("object");
  });

  test("callTool routes through the server and returns a structured result", async () => {
    // No CDP endpoint set → the runner returns a graceful failure, surfaced as an
    // MCP tool result (isError). Proves the call path works end-to-end for any client.
    const res = await client.callTool({ name: "ship-order", arguments: {} });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("CDP endpoint");
  });
});
