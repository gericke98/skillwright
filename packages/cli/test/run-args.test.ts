import { describe, expect, it } from "vitest";
import { parseTimeoutMs } from "../src/run-args";

describe("parseTimeoutMs", () => {
  it("returns undefined when no --timeout flag is present (driver keeps its default)", () => {
    expect(parseTimeoutMs(["run", "my-skill", "--relay"])).toBeUndefined();
  });

  it("parses --timeout <seconds> into milliseconds", () => {
    expect(parseTimeoutMs(["run", "my-skill", "--timeout", "15"])).toBe(15000);
  });

  it("accepts a fractional seconds value", () => {
    expect(parseTimeoutMs(["run", "my-skill", "--timeout", "2.5"])).toBe(2500);
  });

  it("ignores a non-numeric or missing value rather than passing NaN to the driver", () => {
    expect(parseTimeoutMs(["run", "my-skill", "--timeout", "soon"])).toBeUndefined();
    expect(parseTimeoutMs(["run", "my-skill", "--timeout"])).toBeUndefined();
  });

  it("rejects zero and negative timeouts (would make every step fail instantly)", () => {
    expect(parseTimeoutMs(["run", "my-skill", "--timeout", "0"])).toBeUndefined();
    expect(parseTimeoutMs(["run", "my-skill", "--timeout", "-4"])).toBeUndefined();
  });
});
