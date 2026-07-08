import { describe, expect, test } from "vitest";
import { extractFirstJson } from "../src/llm/extract";

describe("extractFirstJson — the agent-cli text-mode reality (§6.3)", () => {
  test("parses a bare JSON object with no surrounding prose", () => {
    expect(extractFirstJson('{"a":1}')).toEqual({ a: 1 });
  });

  test("pulls JSON out of a ```json fenced block surrounded by prose", () => {
    const raw = 'Sure! Here is the result:\n```json\n{"name":"demo","ok":true}\n```\nHope that helps.';
    expect(extractFirstJson(raw)).toEqual({ name: "demo", ok: true });
  });

  test("handles a fenced block with no language tag", () => {
    const raw = "```\n{\"x\":[1,2,3]}\n```";
    expect(extractFirstJson(raw)).toEqual({ x: [1, 2, 3] });
  });

  test("tolerates leading and trailing prose around a bare object", () => {
    const raw = "Here you go: {\"tag\":\"destructive\"} — done!";
    expect(extractFirstJson(raw)).toEqual({ tag: "destructive" });
  });

  test("returns the FIRST parse-valid object when several blocks appear", () => {
    const raw = '```json\n{"first":1}\n```\nand also\n```json\n{"second":2}\n```';
    expect(extractFirstJson(raw)).toEqual({ first: 1 });
  });

  test("skips a malformed block and takes the next valid one", () => {
    const raw = "```json\n{not valid json,}\n```\nretrying:\n```json\n{\"recovered\":true}\n```";
    expect(extractFirstJson(raw)).toEqual({ recovered: true });
  });

  test("does not split on braces that live inside string values", () => {
    expect(extractFirstJson('prefix {"msg":"a } b { c"} suffix')).toEqual({ msg: "a } b { c" });
  });

  test("extracts a top-level JSON array", () => {
    expect(extractFirstJson('result: [{"i":0},{"i":1}]')).toEqual([{ i: 0 }, { i: 1 }]);
  });

  test("returns undefined when there is no JSON at all", () => {
    expect(extractFirstJson("I could not complete that task, sorry.")).toBeUndefined();
  });

  test("returns undefined for an unterminated object", () => {
    expect(extractFirstJson('here: {"a":1')).toBeUndefined();
  });
});
