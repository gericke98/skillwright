import { defaultLibraryDir } from "../paths";
import type { ReplayResult } from "../replay";
import { listSkillTools } from "./skill-tools";

/** Runs a skill by slug with the given inputs — injected so the protocol layer
 * is testable without a browser. Production wires this to the relay/cdp run path. */
export type McpRunner = (slug: string, inputs: Record<string, unknown>) => Promise<ReplayResult>;

export interface McpContext {
  libraryDir?: string;
  runSkill: McpRunner;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: number | string; result: unknown }
  | { jsonrpc: "2.0"; id: number | string; error: { code: number; message: string } };

const PROTOCOL_VERSION = "2024-11-05";

function textResult(text: string, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

/** Map a ReplayResult to an MCP tool-call result. */
function replayToMcp(slug: string, result: ReplayResult) {
  switch (result.status) {
    case "ok":
      return textResult(`Ran "${slug}" successfully.`);
    case "needs-confirmation":
      return textResult(
        `"${slug}" has a destructive step and needs confirmation: ${result.report.reason}`,
        true,
      );
    case "failed":
      return textResult(`"${slug}" failed:\n${JSON.stringify(result.report, null, 2)}`, true);
  }
}

/**
 * Handle one MCP JSON-RPC request. Supports `initialize`, `tools/list`, and
 * `tools/call`; notifications (no id) get no response; unknown methods return
 * error -32601. This is the whole surface that lets any MCP client run
 * skillwright skills as tools.
 */
export async function handleMcpRequest(
  request: JsonRpcRequest,
  ctx: McpContext,
): Promise<JsonRpcResponse | null> {
  const libraryDir = ctx.libraryDir ?? defaultLibraryDir();
  const { id } = request;
  // Notifications carry no id and expect no response.
  if (id === undefined) return null;

  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string): JsonRpcResponse => ({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });

  switch (request.method) {
    case "initialize":
      return ok({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "skillwright", version: "0.0.0" },
      });
    case "tools/list":
      return ok({ tools: listSkillTools(libraryDir) });
    case "tools/call": {
      const params = request.params ?? {};
      const name = typeof params.name === "string" ? params.name : "";
      if (!name) return err(-32602, "tools/call requires a tool name");
      const args = (params.arguments as Record<string, unknown> | undefined) ?? {};
      const result = await ctx.runSkill(name, args);
      return ok(replayToMcp(name, result));
    }
    default:
      return err(-32601, `Method not found: ${request.method}`);
  }
}
