// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import type { FinalParam } from "@skillwright/shared";
import { renderParamApproval } from "../src/pipeline/param-view";

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = `<div id="root"></div>`;
  container = document.getElementById("root")!;
});

const baseParams: FinalParam[] = [
  {
    name: "invoiceId",
    type: "string",
    required: true,
    demoValue: "INV-001",
    rationale: "identifies the target invoice",
    confidence: "low",
  },
  {
    name: "amount",
    type: "number",
    required: false,
    demoValue: "500",
    rationale: "critic-proposed addition",
    confidence: "medium",
  },
];

const secretParam: FinalParam = {
  name: "password",
  type: "string",
  required: true,
  demoValue: "",
  rationale: "secret — always a parameter",
  confidence: "high",
};

describe("renderParamApproval — rendering", () => {
  test("renders one .param-row per param", () => {
    renderParamApproval(container, baseParams, { onApprove: () => {} });
    expect(container.querySelectorAll(".param-row").length).toBe(2);
  });

  test("each row shows name, type, demoValue, rationale", () => {
    renderParamApproval(container, baseParams, { onApprove: () => {} });
    const row = container.querySelectorAll(".param-row")[0]!;
    expect(row.textContent).toContain("invoiceId");
    expect(row.textContent).toContain("string");
    expect(row.textContent).toContain("INV-001");
    expect(row.textContent).toContain("identifies the target invoice");
  });

  test("renders an approve button with id=approve-params", () => {
    renderParamApproval(container, baseParams, { onApprove: () => {} });
    expect(container.querySelector("#approve-params")).not.toBeNull();
  });

  test("required checkbox reflects param.required", () => {
    renderParamApproval(container, baseParams, { onApprove: () => {} });
    const rows = container.querySelectorAll(".param-row");
    const req0 = rows[0]!.querySelector<HTMLInputElement>(".param-required")!;
    const req1 = rows[1]!.querySelector<HTMLInputElement>(".param-required")!;
    expect(req0.checked).toBe(true);
    expect(req1.checked).toBe(false);
  });

  test("param-include checkbox defaults checked (treated as variable)", () => {
    renderParamApproval(container, baseParams, { onApprove: () => {} });
    const row = container.querySelectorAll(".param-row")[0]!;
    const include = row.querySelector<HTMLInputElement>(".param-include")!;
    expect(include.checked).toBe(true);
    expect(include.disabled).toBe(false);
  });
});

describe("renderParamApproval — approve payload editing", () => {
  test("unchecking a row's param-include removes it from the emitted list", () => {
    let emitted: FinalParam[] | undefined;
    renderParamApproval(container, baseParams, { onApprove: (p) => (emitted = p) });

    const rows = container.querySelectorAll(".param-row");
    const include1 = rows[1]!.querySelector<HTMLInputElement>(".param-include")!;
    include1.checked = false;
    include1.dispatchEvent(new Event("change"));

    container.querySelector<HTMLButtonElement>("#approve-params")!.click();

    expect(emitted).toBeDefined();
    expect(emitted!.map((p) => p.name)).toEqual(["invoiceId"]);
  });

  test("toggling param-required flips required in the emitted param", () => {
    let emitted: FinalParam[] | undefined;
    renderParamApproval(container, baseParams, { onApprove: (p) => (emitted = p) });

    const rows = container.querySelectorAll(".param-row");
    const req1 = rows[1]!.querySelector<HTMLInputElement>(".param-required")!;
    expect(req1.checked).toBe(false);
    req1.checked = true;
    req1.dispatchEvent(new Event("change"));

    container.querySelector<HTMLButtonElement>("#approve-params")!.click();

    const amount = emitted!.find((p) => p.name === "amount");
    expect(amount?.required).toBe(true);
  });

  test("approving with no edits emits the same set of names, unmodified required flags", () => {
    let emitted: FinalParam[] | undefined;
    renderParamApproval(container, baseParams, { onApprove: (p) => (emitted = p) });
    container.querySelector<HTMLButtonElement>("#approve-params")!.click();
    expect(emitted!.map((p) => p.name).sort()).toEqual(["amount", "invoiceId"]);
    expect(emitted!.find((p) => p.name === "invoiceId")?.required).toBe(true);
    expect(emitted!.find((p) => p.name === "amount")?.required).toBe(false);
  });
});

describe("renderParamApproval — secret hardening", () => {
  test("a high-confidence (secret) param's include toggle is checked, disabled, and row is marked .param-secret", () => {
    renderParamApproval(container, [secretParam], { onApprove: () => {} });
    const row = container.querySelector(".param-row")!;
    expect(row.classList.contains("param-secret")).toBe(true);
    const include = row.querySelector<HTMLInputElement>(".param-include")!;
    expect(include.checked).toBe(true);
    expect(include.disabled).toBe(true);
  });

  test("secret survives approve even if a disabled include input is force-unchecked via JS", () => {
    let emitted: FinalParam[] | undefined;
    renderParamApproval(container, [...baseParams, secretParam], { onApprove: (p) => (emitted = p) });

    const rows = container.querySelectorAll(".param-row");
    const secretRow = Array.from(rows).find((r) => r.classList.contains("param-secret"))!;
    const include = secretRow.querySelector<HTMLInputElement>(".param-include")!;
    // Force-tamper a disabled input directly via JS (bypassing normal user interaction).
    include.checked = false;

    container.querySelector<HTMLButtonElement>("#approve-params")!.click();

    expect(emitted!.some((p) => p.name === "password")).toBe(true);
  });

  test("a high-confidence (secret) param's required checkbox is checked AND disabled", () => {
    renderParamApproval(container, [secretParam], { onApprove: () => {} });
    const row = container.querySelector(".param-row")!;
    const required = row.querySelector<HTMLInputElement>(".param-required")!;
    expect(required.checked).toBe(true);
    expect(required.disabled).toBe(true);
  });

  test("secret's required stays true on approve even if a disabled required input is force-unchecked via JS", () => {
    let emitted: FinalParam[] | undefined;
    renderParamApproval(container, [...baseParams, secretParam], { onApprove: (p) => (emitted = p) });

    const rows = container.querySelectorAll(".param-row");
    const secretRow = Array.from(rows).find((r) => r.classList.contains("param-secret"))!;
    const required = secretRow.querySelector<HTMLInputElement>(".param-required")!;
    // Force-tamper a disabled input directly via JS (bypassing normal user interaction,
    // and bypassing the ordinary click-a-checkbox path too).
    required.checked = false;

    container.querySelector<HTMLButtonElement>("#approve-params")!.click();

    const secret = emitted!.find((p) => p.name === "password");
    expect(secret?.required).toBe(true);
  });

  test("a non-secret param's required checkbox still works normally (unchecking emits required: false)", () => {
    let emitted: FinalParam[] | undefined;
    renderParamApproval(container, baseParams, { onApprove: (p) => (emitted = p) });

    const rows = container.querySelectorAll(".param-row");
    const req0 = rows[0]!.querySelector<HTMLInputElement>(".param-required")!;
    expect(req0.checked).toBe(true);
    expect(req0.disabled).toBe(false);
    req0.checked = false;
    req0.dispatchEvent(new Event("change"));

    container.querySelector<HTMLButtonElement>("#approve-params")!.click();

    const invoiceId = emitted!.find((p) => p.name === "invoiceId");
    expect(invoiceId?.required).toBe(false);
  });
});

describe("renderParamApproval — XSS safety", () => {
  test("HTML in name/rationale is rendered as text, never parsed as markup", () => {
    const malicious: FinalParam = {
      name: `<img src=x onerror=alert(1)>`,
      type: "string",
      required: false,
      demoValue: "ok",
      rationale: `<img src=x onerror=alert(2)>`,
      confidence: "low",
    };
    renderParamApproval(container, [malicious], { onApprove: () => {} });

    expect(container.innerHTML).not.toContain("<img");
    expect(container.textContent).toContain(`<img src=x onerror=alert(1)>`);
    expect(container.textContent).toContain(`<img src=x onerror=alert(2)>`);
  });
});
