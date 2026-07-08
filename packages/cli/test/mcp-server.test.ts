import { describe, expect, test, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleMcpRequest, type McpRunner } from "../src/mcp/server";

function libraryWithSkill(): string {
  const lib = mkdtempSync(join(tmpdir(), "sw-mcp-srv-"));
  mkdirSync(join(lib, "approve-invoice"), { recursive: true });
  writeFileSync(
    join(lib, "approve-invoice", "SKILL.md"),
    "---\nname: approve-invoice\ndescription: Approves an invoice.\nmetadata:\n  skillwright-inputs: '[{\"name\":\"invoice_number\",\"type\":\"string\",\"required\":true}]'\n---\n",
  );
  return lib;
}

const okRunner: McpRunner = async () => ({ status: "ok" });

describe("handleMcpRequest — MCP JSON-RPC", () => {
  test("initialize returns the skillwright server info and tools capability", async () => {
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { libraryDir: libraryWithSkill(), runSkill: okRunner },
    );
    expect(res).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "skillwright" }, capabilities: { tools: {} } },
    });
  });

  test("tools/list returns the installed skills as tools", async () => {
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      { libraryDir: libraryWithSkill(), runSkill: okRunner },
    );
    const tools = (res as { result: { tools: Array<{ name: string }> } }).result.tools;
    expect(tools.map((t) => t.name)).toContain("approve-invoice");
  });

  test("tools/call routes to the runner with the parsed inputs and reports success", async () => {
    const runSkill = vi.fn(okRunner);
    const res = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "approve-invoice", arguments: { invoice_number: "INV-1042" } },
      },
      { libraryDir: libraryWithSkill(), runSkill },
    );
    expect(runSkill).toHaveBeenCalledWith("approve-invoice", { invoice_number: "INV-1042" });
    const result = (res as { result: { isError?: boolean; content: Array<{ text: string }> } }).result;
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toMatch(/approve-invoice/);
  });

  test("tools/call surfaces a destructive confirmation requirement as an MCP error", async () => {
    const runSkill: McpRunner = async () => ({
      status: "needs-confirmation",
      report: { stepIndex: 2, effect: "destructive", selectorsTried: [], reason: "needs --confirm-destructive" },
    });
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "approve-invoice", arguments: {} } },
      { libraryDir: libraryWithSkill(), runSkill },
    );
    const result = (res as { result: { isError?: boolean } }).result;
    expect(result.isError).toBe(true);
  });

  test("an unknown method returns JSON-RPC error -32601", async () => {
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", id: 5, method: "does/not/exist", params: {} },
      { libraryDir: libraryWithSkill(), runSkill: okRunner },
    );
    expect((res as { error: { code: number } }).error.code).toBe(-32601);
  });

  test("a notification (no id) produces no response", async () => {
    const res = await handleMcpRequest(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { libraryDir: libraryWithSkill(), runSkill: okRunner },
    );
    expect(res).toBeNull();
  });
});
