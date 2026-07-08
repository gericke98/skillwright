import { describe, expect, test, vi } from "vitest";
import { RelayStepDriver, type RelayTransport } from "../src/relay-driver";

describe("RelayStepDriver — snapshot for tier-3 heal over the relay", () => {
  test("snapshot() asks the extension for the live page view and returns it", async () => {
    const send = vi.fn(async (req: { action: string }) =>
      req.action === "snapshot"
        ? { ok: true, url: "https://erp.test/invoices", aria: 'button "Delete"' }
        : { ok: true },
    );
    const driver = new RelayStepDriver({ send } as unknown as RelayTransport);

    const snap = await driver.snapshot();
    expect(send).toHaveBeenCalledWith({ action: "snapshot", selector: "" });
    expect(snap).toEqual({ url: "https://erp.test/invoices", aria: 'button "Delete"' });
  });

  test("snapshot() degrades to empty fields if the extension omits them", async () => {
    const driver = new RelayStepDriver({ send: async () => ({ ok: true }) } as RelayTransport);
    expect(await driver.snapshot()).toEqual({ url: "", aria: "" });
  });

  test("execute still performs a step over the transport (unchanged)", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const driver = new RelayStepDriver({ send } as unknown as RelayTransport);
    expect(await driver.execute({ type: "click", effect: "mutating", selectors: [] }, "aria/Go")).toBe("ok");
  });
});
