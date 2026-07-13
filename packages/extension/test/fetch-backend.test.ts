import { describe, it, expect, vi } from "vitest";
import { createFetchBackend } from "../src/llm/fetch-backend";

describe("fetch backend", () => {
  it("returns schema-valid JSON via completeWithRepair", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: '{"ok":true}' }],
          }),
        ),
    );
    const be = createFetchBackend({
      provider: "anthropic",
      apiKey: "k",
      model: "claude-sonnet-5",
      fetchImpl,
    });
    const out = await be.complete<{ ok: boolean }>("hi", {
      jsonSchema: {},
      validate: (v: any) => (v?.ok ? [] : ["no ok"]),
    });
    expect(out.ok).toBe(true);
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({
      "anthropic-dangerous-direct-browser-access": "true",
    });
  });

  it("supports the openai shape", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }],
          }),
        ),
    );
    const be = createFetchBackend({
      provider: "openai",
      apiKey: "k",
      model: "gpt-4o",
      fetchImpl,
    });
    const out = await be.complete<{ ok: boolean }>("hi", {
      jsonSchema: {},
      validate: (v: any) => (v?.ok ? [] : ["no ok"]),
    });
    expect(out.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer k");
  });

  it("throws an error containing the status but never the api key on a non-2xx anthropic response", async () => {
    const secretKey = "sk-super-secret-do-not-leak";
    const fetchImpl = vi.fn(
      async () =>
        new Response(`Incorrect API key provided: ${secretKey}`, {
          status: 401,
          statusText: "Unauthorized",
        }),
    );
    const be = createFetchBackend({
      provider: "anthropic",
      apiKey: secretKey,
      model: "claude-sonnet-5",
      fetchImpl,
    });
    try {
      await be.complete("hi", { jsonSchema: {}, validate: () => [] });
      throw new Error("expected rejection");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain("401");
      expect(message).not.toContain(secretKey);
      expect(message).toContain("[REDACTED]");
    }
  });

  it("throws an error containing the status but never the api key on a non-2xx openai response", async () => {
    const secretKey = "sk-super-secret-do-not-leak";
    const fetchImpl = vi.fn(
      async () =>
        new Response(`Incorrect API key provided: ${secretKey}`, {
          status: 401,
          statusText: "Unauthorized",
        }),
    );
    const be = createFetchBackend({
      provider: "openai",
      apiKey: secretKey,
      model: "gpt-4o",
      fetchImpl,
    });
    try {
      await be.complete("hi", { jsonSchema: {}, validate: () => [] });
      throw new Error("expected rejection");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain("401");
      expect(message).not.toContain(secretKey);
      expect(message).toContain("[REDACTED]");
    }
  });

  it("throws a named error when the anthropic response shape is malformed", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ nope: true })));
    const be = createFetchBackend({
      provider: "anthropic",
      apiKey: "k",
      model: "claude-sonnet-5",
      fetchImpl,
    });
    await expect(
      be.complete("hi", { jsonSchema: {}, validate: () => [] }),
    ).rejects.toThrow("Anthropic response missing content[0].text");
  });

  it("throws a named error when the openai response shape is malformed", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ nope: true })));
    const be = createFetchBackend({
      provider: "openai",
      apiKey: "k",
      model: "gpt-4o",
      fetchImpl,
    });
    await expect(
      be.complete("hi", { jsonSchema: {}, validate: () => [] }),
    ).rejects.toThrow("OpenAI response missing choices[0].message.content");
  });
});
