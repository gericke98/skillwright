import { describe, expect, test } from "vitest";
import { SchemaExhaustedError } from "@skillwright/shared";
import { MockBackend } from "../src/llm/mock-backend";
import { createLlmHealer } from "../src/heal";
import type { ReplayStep, PageSnapshot } from "../src/replay";

const snapshot: PageSnapshot = {
  url: "https://erp.test/invoices",
  aria: 'button "Remove invoice INV-1042"',
};
const step: ReplayStep = { type: "click", effect: "destructive", selectors: ["aria/Delete invoice INV-1042"] };

describe("createLlmHealer", () => {
  test("returns the selector the backend proposes", async () => {
    const healer = createLlmHealer(new MockBackend(() => ({ selector: 'aria/Remove invoice INV-1042' })));
    expect(await healer(step, snapshot)).toBe("aria/Remove invoice INV-1042");
  });

  test("gives the model the stale label and the live page snapshot", async () => {
    let seen = "";
    const healer = createLlmHealer(
      new MockBackend((prompt) => {
        seen = prompt;
        return { selector: "aria/x" };
      }),
    );
    await healer(step, snapshot);
    expect(seen).toContain("Delete invoice INV-1042"); // the stale target
    expect(seen).toContain("Remove invoice INV-1042"); // from the snapshot
  });

  test("returns null when the backend cannot produce a valid selector (heal gives up)", async () => {
    const healer = createLlmHealer(
      new MockBackend(() => {
        throw new SchemaExhaustedError(3, ["no selector"], "junk");
      }),
    );
    expect(await healer(step, snapshot)).toBeNull();
  });

  test("rejects an empty selector as invalid (never returns a blank)", async () => {
    const healer = createLlmHealer(new MockBackend(() => ({ selector: "   " })));
    expect(await healer(step, snapshot)).toBeNull();
  });
});
