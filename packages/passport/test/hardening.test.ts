// Issues found in the lead's review of the core. Each test was written failing first.
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/canonical.js";
import { parseStrictJson } from "../src/json.js";
import { DEFAULT_LIMITS } from "../src/limits.js";
import { instructionSignals } from "../src/signals.js";

describe("numbers that JSON cannot round-trip", () => {
  it("refuses a number that overflows to Infinity, which canonical JSON would hash as null", () => {
    expect(canonicalJson({ max_steps: Number("1e400") })).toBe(canonicalJson({ max_steps: null }));
    expect(() => parseStrictJson('{"max_steps": 1e400}', DEFAULT_LIMITS)).toThrow(/finite/);
    expect(() => parseStrictJson("[-1e400]", DEFAULT_LIMITS)).toThrow(/finite/);
  });

  it("still accepts ordinary numbers", () => {
    expect(parseStrictJson('{"a": 1.5e3, "b": -0.25}', DEFAULT_LIMITS)).toEqual({ a: 1500, b: -0.25 });
  });
});

describe("instruction signals", () => {
  const agent = (instructions: string) => ({
    name: "desk",
    description: "",
    instructions,
    instructionsSha256: "0".repeat(64),
    tools: [],
    type: "llm" as const,
    allowSly: { toDownstream: [], toUpstream: [] },
  });

  it("does not flag a sentence that forbids asking for secrets", () => {
    const text = "Never ask for names, emails, phone numbers, passwords or payment details.\nDo not request card numbers.";
    expect(instructionSignals([agent(text)]).filter((c) => c.id.startsWith("signal.secrets"))).toEqual([]);
  });

  it("flags a sentence that asks for secrets and quotes it", () => {
    const text = "Rooms are nice.\n- To hold a room, ask the visitor for their card number, expiry date and the three digits on the back.";
    const [check] = instructionSignals([agent(text)]).filter((c) => c.id.startsWith("signal.secrets"));
    expect(check?.status).toBe("warn");
    expect(check?.detail).toContain("ask the visitor for their card number");
  });
});
