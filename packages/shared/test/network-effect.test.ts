import { describe, expect, test } from "vitest";
import { deriveNetworkEffect, correlateRequests, type CapturedRequest, type Step } from "../src/index";

const req = (method: string, timestamp = 0): CapturedRequest => ({
  method,
  url: "https://api.test/x",
  timestamp,
});

describe("deriveNetworkEffect — HTTP method is ground-truth effect", () => {
  test("GET/HEAD/OPTIONS are readonly", () => {
    for (const m of ["GET", "HEAD", "OPTIONS"]) {
      expect(deriveNetworkEffect([req(m)])).toBe("readonly");
    }
  });

  test("POST/PUT/PATCH are mutating", () => {
    for (const m of ["POST", "PUT", "PATCH"]) {
      expect(deriveNetworkEffect([req(m)])).toBe("mutating");
    }
  });

  test("DELETE is destructive", () => {
    expect(deriveNetworkEffect([req("DELETE")])).toBe("destructive");
  });

  test("is case-insensitive", () => {
    expect(deriveNetworkEffect([req("delete")])).toBe("destructive");
    expect(deriveNetworkEffect([req("get")])).toBe("readonly");
  });

  test("takes the MOST severe method across requests", () => {
    expect(deriveNetworkEffect([req("GET"), req("POST"), req("DELETE")])).toBe("destructive");
    expect(deriveNetworkEffect([req("GET"), req("POST")])).toBe("mutating");
  });

  test("an unknown method rounds UP to destructive (never assume safe)", () => {
    expect(deriveNetworkEffect([req("FROBNICATE")])).toBe("destructive");
  });

  test("no requests → undefined (contributes nothing to fusion)", () => {
    expect(deriveNetworkEffect([])).toBeUndefined();
  });
});

describe("correlateRequests — attribute requests to the step that triggered them", () => {
  const steps: Step[] = [
    { type: "click", timestamp: 1000 },
    { type: "click", timestamp: 5000 },
  ];

  test("attaches a request to the most recent step within the window", () => {
    const network = [req("DELETE", 1200)]; // 200ms after step 0
    const out = correlateRequests(steps, network, 1500);
    expect(out[0]!.requests).toHaveLength(1);
    expect(out[0]!.requests![0]!.method).toBe("DELETE");
    expect(out[1]!.requests ?? []).toHaveLength(0);
  });

  test("drops a request outside any step's window", () => {
    const network = [req("POST", 3000)]; // 2000ms after step 0 (> window), before step 1
    const out = correlateRequests(steps, network, 1500);
    expect(out[0]!.requests ?? []).toHaveLength(0);
    expect(out[1]!.requests ?? []).toHaveLength(0);
  });

  test("ignores a request that precedes the first step", () => {
    const out = correlateRequests(steps, [req("GET", 500)], 1500);
    expect(out[0]!.requests ?? []).toHaveLength(0);
  });

  test("assigns to the correct step when several are in range", () => {
    const network = [req("GET", 1100), req("PUT", 5100)];
    const out = correlateRequests(steps, network, 1500);
    expect(out[0]!.requests!.map((r) => r.method)).toEqual(["GET"]);
    expect(out[1]!.requests!.map((r) => r.method)).toEqual(["PUT"]);
  });

  test("leaves steps without timestamps untouched (no requests attached)", () => {
    const untimed: Step[] = [{ type: "click" }];
    const out = correlateRequests(untimed, [req("DELETE", 1000)], 1500);
    expect(out[0]!.requests ?? []).toHaveLength(0);
  });
});
