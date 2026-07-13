/**
 * The settings form — the thing that was missing entirely: `writeLlmSettings`
 * existed and was tested, but nothing in the UI ever called it, so a real user
 * had no way to enter a key short of the devtools console.
 *
 * Pure DOM over injected callbacks (no `chrome.*` in here) so it's unit-testable.
 *
 * Provider `custom` is how a user brings their OWN gateway (OpenRouter, LiteLLM,
 * Azure, a corporate proxy) or points at a local model — skillwright runs no
 * gateway of its own. A local model needs no API key, so the key is optional
 * there and required everywhere else.
 */
import type { LlmProvider, LlmSettings } from "./settings";

export interface SettingsViewHooks {
  onSave(settings: LlmSettings): void;
}

const DEFAULT_MODEL: Record<LlmProvider, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-4o",
  custom: "",
  // The local CLI owns the model choice; the panel doesn't get a say.
  relay: "",
};

export function renderSettings(
  container: HTMLElement,
  current: LlmSettings | undefined,
  hooks: SettingsViewHooks,
): void {
  container.innerHTML = "";

  const provider = document.createElement("select");
  provider.id = "llm-provider";
  for (const [value, label] of [
    ["relay", "Local skillwright CLI (no API key — run `skillwright serve`)"],
    ["anthropic", "Anthropic"],
    ["openai", "OpenAI"],
    ["custom", "Custom / OpenAI-compatible (gateway, proxy, or local model)"],
  ] as const) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    provider.appendChild(opt);
  }
  provider.value = current?.provider ?? "anthropic";
  container.appendChild(labelled("Provider", provider));

  const baseUrl = document.createElement("input");
  baseUrl.id = "llm-base-url";
  baseUrl.type = "text";
  baseUrl.placeholder = "https://openrouter.ai/api/v1/chat/completions";
  baseUrl.value = current?.baseUrl ?? "";
  const baseUrlRow = labelled("Endpoint URL", baseUrl);
  baseUrlRow.id = "llm-base-url-row";
  container.appendChild(baseUrlRow);

  const relayPort = document.createElement("input");
  relayPort.id = "llm-relay-port";
  relayPort.type = "number";
  relayPort.value = String(current?.relayPort ?? 9333);
  const relayPortRow = labelled("serve port", relayPort);
  relayPortRow.id = "llm-relay-port-row";
  container.appendChild(relayPortRow);

  const relayToken = document.createElement("input");
  relayToken.id = "llm-relay-token";
  relayToken.type = "text";
  relayToken.placeholder = "the token skillwright serve printed";
  relayToken.value = current?.relayToken ?? "";
  const relayTokenRow = labelled("serve token", relayToken);
  relayTokenRow.id = "llm-relay-token-row";
  container.appendChild(relayTokenRow);

  const model = document.createElement("input");
  model.id = "llm-model";
  model.type = "text";
  model.value = current?.model ?? DEFAULT_MODEL[provider.value as LlmProvider];
  const modelRow = labelled("Model", model);
  modelRow.id = "llm-model-row";
  container.appendChild(modelRow);

  const apiKey = document.createElement("input");
  apiKey.id = "llm-api-key";
  // `password` so the key isn't shoulder-surfable in a panel that lives on
  // screen while the user records.
  apiKey.type = "password";
  apiKey.value = current?.apiKey ?? "";
  const apiKeyRow = labelled("API key", apiKey);
  apiKeyRow.id = "llm-api-key-row";
  container.appendChild(apiKeyRow);

  const save = document.createElement("button");
  save.id = "llm-save";
  save.textContent = "Save settings";
  container.appendChild(save);

  const status = document.createElement("p");
  status.id = "llm-status";
  status.className = "stage-notice";
  container.appendChild(status);

  /** Each provider asks for a different thing — show only what it needs. The
   *  relay wants pairing details and NO key; custom wants an endpoint. */
  function syncProviderFields(): void {
    const p = provider.value as LlmProvider;
    const isCustom = p === "custom";
    const isRelay = p === "relay";
    baseUrlRow.hidden = !isCustom;
    relayPortRow.hidden = !isRelay;
    relayTokenRow.hidden = !isRelay;
    // The local CLI owns the model and needs no key — don't ask for either.
    modelRow.hidden = isRelay;
    apiKeyRow.hidden = isRelay;
    apiKey.placeholder = isCustom ? "(leave empty for a local model)" : "required";
  }
  provider.addEventListener("change", () => {
    // Switching provider makes the old model name meaningless (and the old key
    // useless) — offer the new provider's default rather than a stale value.
    model.value = DEFAULT_MODEL[provider.value as LlmProvider];
    syncProviderFields();
  });
  syncProviderFields();

  save.addEventListener("click", () => {
    const settings: LlmSettings = {
      provider: provider.value as LlmProvider,
      apiKey: apiKey.value.trim(),
      model: model.value.trim(),
    };
    if (settings.provider === "relay") {
      settings.relayPort = Number(relayPort.value);
      settings.relayToken = relayToken.value.trim();
      // No key, no model — the local CLI owns both.
      settings.apiKey = "";
      settings.model = "";
    } else {
      const url = baseUrl.value.trim();
      if (settings.provider === "custom") settings.baseUrl = url;
      else if (url) settings.baseUrl = url;
    }

    const error = validate(settings);
    if (error) {
      status.textContent = error;
      status.className = "stage-error";
      return;
    }
    status.textContent = "Saved.";
    status.className = "stage-notice";
    hooks.onSave(settings);
  });
}

/** Mirrors `isCompleteSettings`, but tells the user WHICH field is wrong. */
function validate(s: LlmSettings): string | undefined {
  if (s.provider === "relay") {
    if (!s.relayPort || !Number.isFinite(s.relayPort)) return "Enter the port `skillwright serve` printed.";
    if (!s.relayToken) return "Paste the token `skillwright serve` printed.";
    return undefined;
  }
  if (!s.model) return "Enter a model name.";
  if (s.provider === "custom") {
    if (!s.baseUrl) return "Enter the endpoint URL for your gateway or local model.";
    return undefined;
  }
  if (!s.apiKey) return "Enter an API key.";
  return undefined;
}

export function renderSettingsStatus(container: HTMLElement, message: string): void {
  const status = container.querySelector<HTMLParagraphElement>("#llm-status");
  if (status) status.textContent = message;
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement("label");
  label.appendChild(document.createTextNode(text));
  label.appendChild(control);
  return label;
}
