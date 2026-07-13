import { createAgentCliBackend, createAgentCliGenerate, type AgentCliOptions } from "./agent-cli-backend";
import { createApiBackend, createApiGenerate } from "./api-backend";
import type { LlmBackend } from "@skillwright/shared";

export interface DefaultBackendOptions {
  /** Environment to read SKILLWRIGHT_API_KEY from (default: process.env). */
  env?: NodeJS.ProcessEnv;
  /** Passed through when the agent-cli backend is selected. */
  agentCli?: AgentCliOptions;
}

/**
 * Pick a backend per §6.3: the agent-cli backend is the default (it inherits
 * the user's existing agent trust and sends nothing new off-machine), and the
 * direct api backend is opt-in — selected only when SKILLWRIGHT_API_KEY is set.
 * `BSKILL_API_KEY` is still honored as a legacy alias (pre-rename compat).
 */
export function createDefaultBackend(opts: DefaultBackendOptions = {}): LlmBackend {
  const env = opts.env ?? process.env;
  const apiKey = env.SKILLWRIGHT_API_KEY ?? env.BSKILL_API_KEY;
  if (apiKey) return createApiBackend({ apiKey });
  return createAgentCliBackend(opts.agentCli);
}

/**
 * The same selection rule, but returning RAW text completion instead of a
 * schema-validating backend. This is what `skillwright serve` exposes to the
 * extension: a `SchemaSpec.validate` is a function and can't cross a WebSocket,
 * so the schema and the repair loop stay in the browser and only prompt→text
 * travels the wire.
 *
 * The payoff: the panel can compile skills using the user's EXISTING
 * `claude`/`codex` auth — no API key in `chrome.storage.local`, no key to
 * create, and nothing sent anywhere the user's agent CLI wasn't already sending.
 */
export function createDefaultGenerate(opts: DefaultBackendOptions = {}): {
  name: string;
  generate: (prompt: string) => Promise<string>;
} {
  const env = opts.env ?? process.env;
  const apiKey = env.SKILLWRIGHT_API_KEY ?? env.BSKILL_API_KEY;
  if (apiKey) return createApiGenerate({ apiKey });
  return createAgentCliGenerate(opts.agentCli);
}
