// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import { renderStages } from "../src/pipeline/stage-view";

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = `<div id="root"></div>`;
  container = document.getElementById("root")!;
});

const ALL_STAGES = ["record", "distill", "parameterize", "script", "export", "verify"];

describe("renderStages", () => {
  test("renders all 6 stage labels as .stage elements", () => {
    renderStages(container, "record");
    const stages = container.querySelectorAll(".stage");
    expect(stages.length).toBe(6);
    const texts = Array.from(stages).map((s) => s.textContent);
    for (const label of ALL_STAGES) {
      expect(texts.some((t) => t?.includes(label))).toBe(true);
    }
  });

  test("marks the current stage with .stage-current, and only that one", () => {
    renderStages(container, "parameterize");
    const current = container.querySelectorAll(".stage-current");
    expect(current.length).toBe(1);
    expect(current[0]!.textContent).toContain("parameterize");
  });

  test("no .stage-error element when error is absent", () => {
    renderStages(container, "distill");
    expect(container.querySelector(".stage-error")).toBeNull();
  });

  test("renders the error message as text in a .stage-error element", () => {
    renderStages(container, "distill", "distill LLM call timed out");
    const errEl = container.querySelector(".stage-error");
    expect(errEl).not.toBeNull();
    expect(errEl!.textContent).toBe("distill LLM call timed out");
  });

  test("error text is rendered as text, not parsed as HTML", () => {
    renderStages(container, "script", "<img src=x onerror=alert(1)>");
    expect(container.innerHTML).not.toContain("<img");
    expect(container.querySelector(".stage-error")!.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  test("re-rendering replaces previous content (no duplicate stages)", () => {
    renderStages(container, "record");
    renderStages(container, "distill");
    expect(container.querySelectorAll(".stage").length).toBe(6);
    expect(container.querySelectorAll(".stage-current").length).toBe(1);
  });
});
