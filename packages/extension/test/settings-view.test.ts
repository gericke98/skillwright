// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import type { LlmSettings } from "../src/llm/settings";
import { renderSettings } from "../src/llm/settings-view";

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = `<div id="root"></div>`;
  container = document.getElementById("root")!;
});

const $ = <T extends HTMLElement>(sel: string): T => container.querySelector<T>(sel)!;

function save(): LlmSettings | undefined {
  let saved: LlmSettings | undefined;
  renderSettings(container, undefined, { onSave: (s) => (saved = s) });
  return saved;
}

describe("renderSettings — the form that lets a user enter a key at all", () => {
  test("renders provider, model, key and a save button", () => {
    renderSettings(container, undefined, { onSave: () => {} });
    expect($("#llm-provider")).not.toBeNull();
    expect($("#llm-model")).not.toBeNull();
    expect($("#llm-api-key")).not.toBeNull();
    expect($("#llm-save")).not.toBeNull();
  });

  test("the API key field is a password input (the panel sits open while recording)", () => {
    renderSettings(container, undefined, { onSave: () => {} });
    expect($<HTMLInputElement>("#llm-api-key").type).toBe("password");
  });

  test("saving a hosted provider emits the settings", () => {
    let saved: LlmSettings | undefined;
    renderSettings(container, undefined, { onSave: (s) => (saved = s) });
    $<HTMLInputElement>("#llm-api-key").value = "sk-abc";
    $<HTMLButtonElement>("#llm-save").click();
    expect(saved).toEqual({ provider: "anthropic", apiKey: "sk-abc", model: "claude-sonnet-5" });
  });

  test("a hosted provider without a key is refused, and says so", () => {
    let saved: LlmSettings | undefined;
    renderSettings(container, undefined, { onSave: (s) => (saved = s) });
    $<HTMLButtonElement>("#llm-save").click();
    expect(saved).toBeUndefined();
    expect(container.textContent).toContain("Enter an API key");
  });

  test("existing settings prefill the form (so a user can edit, not retype)", () => {
    renderSettings(
      container,
      { provider: "openai", apiKey: "sk-old", model: "gpt-4o" },
      { onSave: () => {} },
    );
    expect($<HTMLSelectElement>("#llm-provider").value).toBe("openai");
    expect($<HTMLInputElement>("#llm-model").value).toBe("gpt-4o");
    expect($<HTMLInputElement>("#llm-api-key").value).toBe("sk-old");
  });
});

describe("renderSettings — bring your own gateway (custom provider)", () => {
  function selectCustom(): void {
    const provider = $<HTMLSelectElement>("#llm-provider");
    provider.value = "custom";
    provider.dispatchEvent(new Event("change"));
  }

  test("the endpoint field is hidden until the custom provider is chosen", () => {
    renderSettings(container, undefined, { onSave: () => {} });
    expect($<HTMLElement>("#llm-base-url-row").hidden).toBe(true);
    selectCustom();
    expect($<HTMLElement>("#llm-base-url-row").hidden).toBe(false);
  });

  test("saves a gateway URL (OpenRouter, LiteLLM, a corporate proxy)", () => {
    let saved: LlmSettings | undefined;
    renderSettings(container, undefined, { onSave: (s) => (saved = s) });
    selectCustom();
    $<HTMLInputElement>("#llm-base-url").value = "https://openrouter.ai/api/v1/chat/completions";
    $<HTMLInputElement>("#llm-model").value = "llama-3.3";
    $<HTMLInputElement>("#llm-api-key").value = "sk-or-1";
    $<HTMLButtonElement>("#llm-save").click();
    expect(saved).toEqual({
      provider: "custom",
      apiKey: "sk-or-1",
      model: "llama-3.3",
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    });
  });

  test("a LOCAL model saves with no API key at all (nothing leaves the machine)", () => {
    let saved: LlmSettings | undefined;
    renderSettings(container, undefined, { onSave: (s) => (saved = s) });
    selectCustom();
    $<HTMLInputElement>("#llm-base-url").value = "http://localhost:11434/v1/chat/completions";
    $<HTMLInputElement>("#llm-model").value = "llama3";
    $<HTMLButtonElement>("#llm-save").click();
    expect(saved).toEqual({
      provider: "custom",
      apiKey: "",
      model: "llama3",
      baseUrl: "http://localhost:11434/v1/chat/completions",
    });
  });

  test("custom without an endpoint is refused — there'd be nowhere to send the request", () => {
    let saved: LlmSettings | undefined;
    renderSettings(container, undefined, { onSave: (s) => (saved = s) });
    selectCustom();
    $<HTMLInputElement>("#llm-model").value = "llama3";
    $<HTMLButtonElement>("#llm-save").click();
    expect(saved).toBeUndefined();
    expect(container.textContent).toContain("endpoint URL");
  });

  test("switching provider replaces a now-meaningless model name with the new default", () => {
    renderSettings(container, undefined, { onSave: () => {} });
    expect($<HTMLInputElement>("#llm-model").value).toBe("claude-sonnet-5");
    const provider = $<HTMLSelectElement>("#llm-provider");
    provider.value = "openai";
    provider.dispatchEvent(new Event("change"));
    expect($<HTMLInputElement>("#llm-model").value).toBe("gpt-4o");
  });
});

/**
 * The best option: no API key in the browser at all. The panel asks the local
 * `skillwright serve` process, which answers with the CLI's own backend (the
 * user's existing claude/codex auth).
 */
describe("renderSettings — local CLI (relay) provider", () => {
  function selectRelay(): void {
    const provider = $<HTMLSelectElement>("#llm-provider");
    provider.value = "relay";
    provider.dispatchEvent(new Event("change"));
  }

  test("asks for pairing details and NOT for a key or a model", () => {
    renderSettings(container, undefined, { onSave: () => {} });
    selectRelay();
    expect($<HTMLElement>("#llm-relay-port-row").hidden).toBe(false);
    expect($<HTMLElement>("#llm-relay-token-row").hidden).toBe(false);
    // The local CLI owns both of these — asking would be a lie.
    expect($<HTMLElement>("#llm-api-key-row").hidden).toBe(true);
    expect($<HTMLElement>("#llm-model-row").hidden).toBe(true);
  });

  test("saves with an empty api key — that IS the feature", () => {
    let saved: LlmSettings | undefined;
    renderSettings(container, undefined, { onSave: (s) => (saved = s) });
    selectRelay();
    $<HTMLInputElement>("#llm-relay-token").value = "tok-123";
    $<HTMLButtonElement>("#llm-save").click();
    expect(saved).toEqual({
      provider: "relay",
      apiKey: "",
      model: "",
      relayPort: 9333,
      relayToken: "tok-123",
    });
  });

  test("refuses to save without the token skillwright serve printed", () => {
    let saved: LlmSettings | undefined;
    renderSettings(container, undefined, { onSave: (s) => (saved = s) });
    selectRelay();
    $<HTMLButtonElement>("#llm-save").click();
    expect(saved).toBeUndefined();
    expect(container.textContent).toContain("token");
  });

  test("a stale API key typed earlier is not carried into relay settings", () => {
    let saved: LlmSettings | undefined;
    renderSettings(container, undefined, { onSave: (s) => (saved = s) });
    $<HTMLInputElement>("#llm-api-key").value = "sk-leftover";
    selectRelay();
    $<HTMLInputElement>("#llm-relay-token").value = "tok-123";
    $<HTMLButtonElement>("#llm-save").click();
    expect(saved!.apiKey).toBe("");
  });
});
