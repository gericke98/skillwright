import { describe, expect, test } from "vitest";
import type { ReplayStep } from "../src/index";
import { RelayStepDriver, type RelayTransport, mintToken, verifyToken } from "../src/index";

const step: ReplayStep = { type: "click", effect: "destructive", selectors: ["aria/Delete"] };

describe("RelayStepDriver — StepDriver over an injected transport", () => {
  test("sends a perform command and maps ok:true → 'ok'", async () => {
    const sent: unknown[] = [];
    const transport: RelayTransport = {
      async send(req) {
        sent.push(req);
        return { ok: true };
      },
    };
    const driver = new RelayStepDriver(transport);
    expect(await driver.execute(step, "aria/Delete")).toBe("ok");
    expect(sent).toEqual([{ action: "click", selector: "aria/Delete", value: undefined }]);
  });

  test("maps ok:false → 'fail'", async () => {
    const transport: RelayTransport = { async send() {
      return { ok: false, error: "not found" };
    } };
    expect(await new RelayStepDriver(transport).execute(step, "aria/Delete")).toBe("fail");
  });

  test("a transport error is treated as 'fail', never thrown", async () => {
    const transport: RelayTransport = { async send() {
      throw new Error("socket closed");
    } };
    expect(await new RelayStepDriver(transport).execute(step, "aria/Delete")).toBe("fail");
  });

  test("forwards the value for edit steps", async () => {
    let seen: unknown;
    const transport: RelayTransport = { async send(req) {
      seen = req;
      return { ok: true };
    } };
    const edit: ReplayStep = { type: "change", effect: "mutating", selectors: ["aria/Amt"], value: "500" };
    await new RelayStepDriver(transport).execute(edit, "aria/Amt");
    expect(seen).toEqual({ action: "change", selector: "aria/Amt", value: "500" });
  });
});

describe("two-party pairing token (review T9)", () => {
  test("a freshly minted token verifies against itself", () => {
    const t = mintToken(() => "abc123");
    expect(verifyToken(t, t)).toBe(true);
  });

  test("a wrong token is rejected", () => {
    expect(verifyToken(mintToken(() => "abc123"), "wrong")).toBe(false);
  });

  test("an empty presented token is always rejected (no bypass)", () => {
    expect(verifyToken(mintToken(() => "abc123"), "")).toBe(false);
  });

  test("verification is constant-length-safe against a differing-length token", () => {
    expect(verifyToken("abcdef", "abc")).toBe(false);
  });
});
