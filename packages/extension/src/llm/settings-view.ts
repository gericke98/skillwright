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

  const model = document.createElement("input");
  model.id = "llm-model";
  model.type = "text";
  model.value = current?.model ?? DEFAULT_MODEL[provider.value as LlmProvider];
  container.appendChild(labelled("Model", model));

  const apiKey = document.createElement("input");
  apiKey.id = "llm-api-key";
  // `password` so the key isn't shoulder-surfable in a panel that lives on
  // screen while the user records.
  apiKey.type = "password";
  apiKey.value = current?.apiKey ?? "";
  container.appendChild(labelled("API key", apiKey));

  const save = document.createElement("button");
  save.id = "llm-save";
  save.textContent = "Save settings";
  container.appendChild(save);

  const status = document.createElement("p");
  status.id = "llm-status";
  status.className = "stage-notice";
  container.appendChild(status);

  /** The endpoint field only makes sense for `custom`; the key is optional there. */
  function syncProviderFields(): void {
    const isCustom = provider.value === "custom";
    baseUrlRow.hidden = !isCustom;
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
    const url = baseUrl.value.trim();
    if (settings.provider === "custom") settings.baseUrl = url;
    else if (url) settings.baseUrl = url;

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
