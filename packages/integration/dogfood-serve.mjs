// Dogfood: the panel borrowing the local CLI's brain.
//
// Starts a real `skillwright serve` relay (backed by the user's real agent CLI
// — claude/codex/gemini on PATH), then drives it with the REAL extension-side
// relay backend over a REAL WebSocket, and runs an actual distiller pass through
// it. No API key anywhere: not in the browser, not in the environment.
//
// This is the whole claim, exercised end to end:
//   panel -> ws://127.0.0.1 -> skillwright serve -> your existing claude auth
//
// Usage: node --import tsx packages/integration/dogfood-serve.mjs
import { WsRelayServer } from "../cli/src/relay-server.ts";
import { createDefaultGenerate } from "../cli/src/llm/factory.ts";
import { mintToken } from "../cli/src/token.ts";
import { createRelayBackend } from "../extension/src/llm/relay-backend.ts";
import { inferIntent, PLACEHOLDER } from "@skillwright/shared";
import WebSocket from "ws";

/** The extension's RelaySocket seam, over `ws` (Node has no browser WebSocket). */
function nodeSocket(port) {
  let ws;
  return {
    connect(onMessage) {
      return new Promise((resolve, reject) => {
        ws = new WebSocket(`ws://127.0.0.1:${port}`);
        ws.on("message", (d) => onMessage(d.toString()));
        ws.on("open", resolve);
        ws.on("error", reject);
      });
    },
    send: (obj) => ws.send(JSON.stringify(obj)),
    close: () => ws.close(),
  };
}

const recording = {
  title: "Sign in and approve an invoice",
  steps: [
    { type: "change", selectors: [["aria/Username"]], value: "tomsmith", timestamp: 1 },
    { type: "change", selectors: [["aria/Password"]], value: PLACEHOLDER, timestamp: 2 },
    { type: "click", selectors: [["aria/Approve invoice INV-2042"]], timestamp: 3 },
  ],
  "x-skillwright": {
    version: 1,
    segment: { id: "dogfood", parentSkill: null, recordedAt: new Date().toISOString() },
  },
};

async function main() {
  if (process.env.SKILLWRIGHT_API_KEY) {
    console.log("note: SKILLWRIGHT_API_KEY is set, so serve will use the api backend.");
    console.log("      unset it to prove the no-key agent-cli path.\n");
  }

  const backend = createDefaultGenerate();
  console.log(`serve backend: ${backend.name}`);

  const token = mintToken();
  const server = new WsRelayServer({ token, port: 0, onGenerate: (p) => backend.generate(p) });
  const { port, url } = await server.start();
  console.log(`serve listening: ${url}`);

  try {
    // Exactly what the panel does — including that it holds NO api key.
    const panelBackend = createRelayBackend({ port, token, socket: nodeSocket(port) });
    console.log(`panel backend: ${panelBackend.name} (no api key)\n`);

    console.log("running a real distiller pass (inferIntent) through the relay...");
    const intent = await inferIntent(recording, panelBackend);

    console.log(`\n  title:       ${intent.title}`);
    console.log(`  description: ${intent.description}\n`);

    const failures = [];
    if (!intent.title?.trim()) failures.push("no title came back");
    if (!intent.description?.trim()) failures.push("no description came back");
    // The prompt is built from a redacted recording — the placeholder must not
    // be echoed back into the skill's own text.
    if (JSON.stringify(intent).includes(PLACEHOLDER)) {
      failures.push("the redaction placeholder leaked into the intent");
    }

    if (failures.length > 0) {
      console.error(`FAILED:\n - ${failures.join("\n - ")}`);
      process.exit(1);
    }
    console.log("the panel compiled a skill through the local CLI. No API key was used anywhere.");
  } finally {
    await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
