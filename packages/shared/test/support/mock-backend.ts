import { SchemaExhaustedError, type LlmBackend, type SchemaSpec } from "../../src/llm/backend";

/**
 * Deterministic in-memory backend for the distiller pass tests that moved into
 * `packages/shared`. Mirrors `packages/cli/src/llm/mock-backend.ts` (a shipped
 * CLI utility) — duplicated here as a test-only fixture rather than imported,
 * since `@skillwright/shared` must not depend on the `cli` package.
 */
export class MockBackend implements LlmBackend {
  readonly name = "mock";

  constructor(
    private readonly responder: (prompt: string, schema: SchemaSpec<unknown>) => unknown,
  ) {}

  async complete<T>(prompt: string, schema: SchemaSpec<T>): Promise<T> {
    const value = this.responder(prompt, schema as SchemaSpec<unknown>);
    const errors = schema.validate(value);
    if (errors.length > 0) {
      throw new SchemaExhaustedError(1, errors, JSON.stringify(value));
    }
    return value as T;
  }
}
