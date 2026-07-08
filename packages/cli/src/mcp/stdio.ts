import { createInterface } from "node:readline";
import { handleMcpRequest, type JsonRpcRequest, type McpRunner } from "./server";

export interface McpServerOptions {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  libraryDir?: string;
  runSkill: McpRunner;
}

/**
 * Run the MCP server over newline-delimited JSON-RPC on the given streams
 * (stdin/stdout in production). Each input line is one request; each non-null
 * response is written as one line. Resolves when the input closes. Malformed
 * lines are answered with a JSON-RPC parse error (-32700) rather than crashing.
 */
export function startMcpServer(opts: McpServerOptions): Promise<void> {
  const rl = createInterface({ input: opts.input, crlfDelay: Infinity });

  const write = (obj: unknown): void => {
    opts.output.write(JSON.stringify(obj) + "\n");
  };

  return new Promise((resolve) => {
    // Process lines sequentially so responses preserve request order.
    let chain: Promise<void> = Promise.resolve();
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      chain = chain.then(async () => {
        let request: JsonRpcRequest;
        try {
          request = JSON.parse(trimmed) as JsonRpcRequest;
        } catch {
          write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
          return;
        }
        const response = await handleMcpRequest(request, {
          libraryDir: opts.libraryDir,
          runSkill: opts.runSkill,
        });
        if (response !== null) write(response);
      });
    });
    rl.on("close", () => {
      void chain.then(resolve);
    });
  });
}
