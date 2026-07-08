import { createAgentCliBackend, type AgentCliOptions } from "./agent-cli-backend";
import { createApiBackend } from "./api-backend";
import type { LlmBackend } from "./backend";

export interface DefaultBackendOptions {
  /** Environment to read BSKILL_API_KEY from (default: process.env). */
  env?: NodeJS.ProcessEnv;
  /** Passed through when the agent-cli backend is selected. */
  agentCli?: AgentCliOptions;
}

/**
 * Pick a backend per §6.3: the agent-cli backend is the default (it inherits
 * the user's existing agent trust and sends nothing new off-machine), and the
 * direct api backend is opt-in — selected only when BSKILL_API_KEY is set.
 */
export function createDefaultBackend(opts: DefaultBackendOptions = {}): LlmBackend {
  const env = opts.env ?? process.env;
  const apiKey = env.BSKILL_API_KEY;
  if (apiKey) return createApiBackend({ apiKey });
  return createAgentCliBackend(opts.agentCli);
}
