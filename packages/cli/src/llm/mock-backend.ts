import { SchemaExhaustedError, type LlmBackend, type SchemaSpec } from "@skillwright/shared";

/**
 * Deterministic in-memory backend for unit tests and P2 distiller plumbing.
 * The responder maps (prompt, schema) → a canned value; the value is still run
 * through the schema's validator so tests can exercise both the happy path and
 * the validation-failure path without spawning anything.
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
