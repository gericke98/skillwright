import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { renderPage } from "../src/page";
import { startFixtureServer, type FixtureServer } from "../src/server";

describe("fixture page variants (heal-path contract)", () => {
  test("variant a and b keep the SAME ARIA names (stable fallback anchor)", () => {
    const a = renderPage("a");
    const b = renderPage("b");
    for (const aria of [
      'aria-label="Delete invoice INV-001"',
      'aria-label="Approve invoice INV-001"',
      'aria-label="Search invoices"',
      'aria-label="Password"',
    ]) {
      expect(a).toContain(aria);
      expect(b).toContain(aria);
    }
  });

  test("variant b SHIFTS the fragile selectors so a's primary selector breaks", () => {
    const a = renderPage("a");
    const b = renderPage("b");
    // a uses data-testid + an id on search; b uses data-qa + renamed delete + no id.
    expect(a).toContain('data-testid="delete-invoice"');
    expect(b).not.toContain('data-testid="delete-invoice"');
    expect(a).toContain('id="invoice-search"');
    expect(b).not.toContain('id="invoice-search"');
    expect(b).toContain('data-qa="row-delete"');
  });

  test("page has a password field so secret-capture can be exercised", () => {
    expect(renderPage("a")).toContain('type="password"');
  });
});

describe("fixture server", () => {
  let fx: FixtureServer;
  beforeAll(async () => {
    fx = await startFixtureServer(0);
  });
  afterAll(async () => {
    await fx.close();
  });

  test("serves variant a by default and variant b on ?variant=b", async () => {
    const a = await (await fetch(fx.url)).text();
    const b = await (await fetch(fx.url + "?variant=b")).text();
    expect(a).toContain('data-testid="delete-invoice"');
    expect(b).toContain('data-qa="row-delete"');
  });
});
