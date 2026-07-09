import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { join } from "node:path";
import { completeWithRepair, type LlmBackend, type SchemaSpec } from "@skillwright/shared";

/** Ordered default candidates; first one found on PATH wins. */
const DEFAULT_BINARIES = ["claude", "codex", "gemini"];

/** Non-interactive invocation args per known agent CLI. Prompt goes via stdin. */
const INVOCATION_ARGS: Record<string, string[]> = {
  claude: ["-p"],
  codex: ["exec"],
  gemini: ["-p"],
};

export interface AgentCliOptions {
  /** Candidate binaries in priority order (default: claude, codex, gemini). */
  binaries?: string[];
  /** Override binary detection (default: PATH scan). Injected in tests. */
  detectBinary?: (candidates: string[]) => string | undefined;
  /** Override process execution (default: spawn + stdin pipe). Injected in tests. */
  runCommand?: (bin: string, args: string[], input: string) => Promise<string>;
  /** Text-mode retry budget (default 3 — higher than api, §6.3). */
  maxAttempts?: number;
}

/** Scan PATH for the first candidate that resolves to an executable file. */
function detectOnPath(candidates: string[]): string | undefined {
  const dirs = (process.env.PATH ?? "").split(":").filter(Boolean);
  for (const bin of candidates) {
    for (const dir of dirs) {
      try {
        accessSync(join(dir, bin), constants.X_OK);
        return bin;
      } catch {
        // not here — keep looking
      }
    }
  }
  return undefined;
}

/** Default runner: spawn the CLI, pipe the prompt to stdin, collect stdout. */
function spawnRunner(bin: string, args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(0, 500)}`));
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

/**
 * agent-cli backend (§6.3): drive a local coding-agent CLI headlessly and pull
 * schema-valid JSON out of its free-text output via the repair loop. Higher
 * retry budget than the api backend because text-mode structure is unreliable.
 */
export function createAgentCliBackend(opts: AgentCliOptions = {}): LlmBackend {
  const candidates = opts.binaries ?? DEFAULT_BINARIES;
  const detect = opts.detectBinary ?? detectOnPath;
  const run = opts.runCommand ?? spawnRunner;
  const maxAttempts = opts.maxAttempts ?? 3;

  const bin = detect(candidates);
  if (!bin) {
    throw new Error(
      `no agent CLI found on PATH (looked for: ${candidates.join(", ")}). Install one or set the api backend.`,
    );
  }
  const args = INVOCATION_ARGS[bin] ?? [];

  return {
    name: `agent-cli:${bin}`,
    complete<T>(prompt: string, schema: SchemaSpec<T>): Promise<T> {
      return completeWithRepair((p) => run(bin, args, p), prompt, schema, maxAttempts);
    },
  };
}
