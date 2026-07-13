/**
 * The one place that turns saved settings into a backend, so the pipeline
 * stages never care which kind they got.
 *
 * Two shapes of backend, one interface:
 *  - `relay`  → the local `skillwright serve` process answers with the CLI's own
 *    backend (the user's existing claude/codex auth). No API key in the browser.
 *  - everything else → BYO-key, called straight from the extension origin.
 */
import type { LlmBackend } from "@skillwright/shared";
import { createFetchBackend } from "./fetch-backend";
import { createRelayBackend } from "./relay-backend";
import type { LlmSettings } from "./settings";

export function createBackend(settings: LlmSettings): LlmBackend {
  if (settings.provider === "relay") {
    return createRelayBackend({
      port: settings.relayPort ?? 9333,
      token: settings.relayToken ?? "",
    });
  }
  return createFetchBackend({
    provider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model,
    baseUrl: settings.baseUrl,
  });
}
