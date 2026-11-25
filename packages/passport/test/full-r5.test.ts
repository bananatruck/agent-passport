import { describe, expect, it } from "vitest";
import { effectiveConfig, summarizeNetwork } from "../src/network.js";
import type { JsonObject } from "../src/json.js";
import { inspect, manifest } from "./helpers.js";

describe("selected published bindings", () => {
  it("scans selected raw and effective links while ignoring other networks", async () => {
    const d = { tools: [{ name: "desk", instructions: "Help." }], links: { local: "https://linked.example/{path}" }, commondefs: { replacement_strings: { path: "safe" } } };
    const hidden = "https://linked.example/a\u200fb";
    const selected = await inspect(manifest(), d, { networks: { transit: { selected: hidden } } });
    expect(selected.verdict).toBe("refused");
    const failure = selected.checks.find(c => c.code === "HIDDEN_TEXT");
    expect(failure?.detail).toContain("published links");
    expect(failure?.detail).toContain("effective links");
    expect((await inspect(manifest(), d, { networks: { unrelated: { other: hidden } } })).verdict).toBe("unreviewed");
  });
});

describe("effective network accounting", () => {
  it("charges only inherited members of deeply merged defaults", () => {
    const raw = { error_fragments: { message: "x".repeat(900_000), retained: "keep" }, tools: Array.from({ length: 19 }, (_, i) => ({ name: `a${i}`, instructions: "Help.", error_fragments: { message: "short" } })) };
    expect(() => effectiveConfig(raw)).not.toThrow();
    const effective = effectiveConfig(raw);
    expect(effective.tools).toEqual(raw.tools.map(a => ({ ...a, error_fragments: { message: "short", retained: "keep" } })));
    expect(() => effectiveConfig({ ...raw, tools: raw.tools.map(a => ({ name: a.name })) })).toThrow(expect.objectContaining({ code: "TOO_LARGE" }));
  });

  it("indexes local names once and still classifies MCP before a local name", async () => {
    let visits = 0;
    const tools: JsonObject[] = Array.from({ length: 200 }, (_, i) => ({ name: `a${i}`, instructions: "Help.", tools: ["a0", "a1", "a2", "a3"] }));
    const counted = new Proxy(tools, { get(target, key, receiver) { if (typeof key === "string" && /^\d+$/.test(key)) visits++; return Reflect.get(target, key, receiver); } });
    const summary = await summarizeNetwork({ tools: counted }, {}, { front_man: "a0" }, { siteBase: "https://peer.example", origin: "https://peer.example", name: "transit", checks: [] });
    expect(summary.agents[0]?.tools.every(t => t.kind === "agent")).toBe(true);
    expect(visits).toBeLessThan(2000);
    const mcp = "https://peer.example/mcp";
    const classified = await summarizeNetwork({ tools: [{ name: mcp, instructions: "Help.", tools: [mcp] }] }, {}, { front_man: mcp }, { siteBase: "https://peer.example", origin: "https://peer.example", name: "transit", checks: [] });
    expect(classified.agents[0]?.tools[0]?.kind).toBe("mcp");
  });
});
