// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import type { SkillDirectory } from "@skillwright/shared";
import { renderExport, renderExportStatus } from "../src/pipeline/export-view";

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = `<div id="root"></div>`;
  container = document.getElementById("root")!;
});

const skill: SkillDirectory = {
  slug: "demo",
  files: { "SKILL.md": "# hi", "assets/recording.json": "{}" },
};

describe("renderExport", () => {
  test("renders the export button", () => {
    renderExport(container, skill, { onExport: () => {} });
    expect(container.querySelector("#export-skill")).not.toBeNull();
  });

  test("clicking export invokes onExport with the final SkillDirectory", () => {
    let exported: SkillDirectory | undefined;
    renderExport(container, skill, { onExport: (s) => (exported = s) });
    container.querySelector<HTMLButtonElement>("#export-skill")!.click();
    expect(exported).toBe(skill);
  });

  test("status line renders error text as text, never markup", () => {
    renderExport(container, skill, { onExport: () => {} });
    renderExportStatus(container, `<img src=x onerror=alert(1)>`);
    expect(container.innerHTML).not.toContain("<img");
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
