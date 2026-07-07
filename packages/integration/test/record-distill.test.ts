// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { renderPage } from "@bskill/fixture-app";
import { computeSelectorStack, redactValue } from "@bskill/extension";
import { distill } from "@bskill/cli";
import type { Recording, Step } from "@bskill/shared";

/**
 * The browser-free half of the M1 round-trip: parse the REAL fixture page,
 * compute selector stacks off its actual DOM (as the content script would),
 * assemble a recording, and distill it. Proves extension → shared → cli compose
 * on real markup. The live capture + relay + replay half needs a browser and is
 * validated in the M1 acceptance run.
 */
function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function stepFor(doc: Document, ariaLabel: string, type: string, value?: string): Step {
  const el = doc.querySelector(`[aria-label="${ariaLabel}"]`);
  if (!el) throw new Error(`fixture missing element: ${ariaLabel}`);
  const step: Step = { type, selectors: computeSelectorStack(el).map((s) => [s]) };
  if (value !== undefined) {
    const type = el.getAttribute("type") ?? undefined;
    step.value = redactValue(value, { type });
  }
  return step;
}

describe("record → distill against the real fixture app", () => {
  test("produces a valid destructive-tagged delete skill with no leaked secret", () => {
    const doc = parse(renderPage("a"));

    const recording: Recording = {
      title: "Delete invoice INV-001",
      steps: [
        stepFor(doc, "Password", "change", "hunter2SecretPassword"),
        stepFor(doc, "Search invoices", "change", "INV-001"),
        stepFor(doc, "Delete invoice INV-001", "click"),
      ],
      "x-bskill": {
        version: 1,
        segment: { id: "seg-int", parentSkill: null, recordedAt: "2026-07-06T00:00:00.000Z" },
      },
    };

    // Capture-time redaction already scrubbed the password value.
    expect(recording.steps[0]!.value).toBe("{secret}");

    const skill = distill(recording, {});
    expect(skill.slug).toBe("delete-invoice-inv-001");

    // The delete step is tagged destructive; the search edit is mutating.
    const walkthrough = skill.files["references/walkthrough.md"];
    expect(walkthrough).toMatch(/destructive/i);
    expect(walkthrough).toMatch(/mutating/i);

    // The real selector stack survived into the walkthrough: the delete button's
    // ARIA name is the stable top-of-stack anchor.
    expect(walkthrough).toContain("aria/Delete invoice INV-001");
    expect(walkthrough).toContain('[data-testid="delete-invoice"]');

    // No secret anywhere in the generated artifact.
    const serialized = JSON.stringify(skill.files);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).toContain("{secret}");
  });

  test("variant b breaks the delete button's primary test-attr selector (heal premise)", () => {
    const a = parse(renderPage("a")).querySelector('[aria-label="Delete invoice INV-001"]')!;
    const b = parse(renderPage("b")).querySelector('[aria-label="Delete invoice INV-001"]')!;
    const stackA = computeSelectorStack(a);
    const stackB = computeSelectorStack(b);

    // The data-testid selector recorded on A does not exist on B ...
    expect(stackA).toContain('[data-testid="delete-invoice"]');
    expect(stackB).not.toContain('[data-testid="delete-invoice"]');
    // ... but the ARIA anchor is stable across the refactor, so a heal can
    // recover by falling down the stack.
    expect(stackA[0]).toBe("aria/Delete invoice INV-001");
    expect(stackB[0]).toBe("aria/Delete invoice INV-001");
  });
});
