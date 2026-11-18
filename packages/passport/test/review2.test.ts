// Findings from the second outside review (GPT 6.1 Sol, round 2). Each test was written failing first.
// The numbers match the review in the round-2 notes.
import { describe, expect, it } from "vitest";
import { createPin } from "../src/index.js";
import { inspectPeer } from "../src/index.js";
import { definition, fakeFetch, inspect, manifest, peer, routes } from "./helpers.js";

const codes = (r: Awaited<ReturnType<typeof inspect>>) => r.checks.filter((c) => c.status === "fail").map((c) => c.code);
const pinsOf = async (m: unknown, d: unknown, links?: unknown) => ({ version: 1 as const, pins: [createPin(await inspect(m, d, links))] });

describe("review 2", () => {
  it("1: pins the manifest's execution policy, so opening peer_policy breaks the pin", async () => {
    const d = { tools: [{ name: "desk", instructions: "Help.", tools: ["https://service.example/n"] }] };
    const closed = { ...manifest(), peer_policy: { mode: "closed" }, allowed_peers: [] as string[] };
    const pins = await pinsOf(closed, d);
    for (const changed of [
      { ...closed, peer_policy: { mode: "open" } },
      { ...closed, allowed_peers: ["https://service.example"] },
      { ...closed, actions: { version: 1, module: "./a.js" } },
    ]) {
      const r = await inspect(changed, d, undefined, { pins });
      expect(r.verdict, JSON.stringify(changed)).toBe("changed");
    }
  });

  it("2: refuses \\b and \\f escapes, which the runtime's HOCON parser reads differently", async () => {
    for (const escape of ["\\b", "\\f"]) {
      const text = `{"tools":[{"name":"desk","instructions":"x${escape}y"}]}`;
      const r = await inspect(manifest(), JSON.parse(text), undefined, {});
      expect(codes(r), escape).toContain("DEFINITION_SHAPE");
      expect(r.checks.some((c) => /HOCON/.test(c.detail))).toBe(true);
    }
  });

  it("3: refuses two tool references that the runtime turns into the same tool name", async () => {
    const d = { tools: [{ name: "desk", instructions: "Help.", tools: ["b-c", "b_c"] }, { name: "b-c", instructions: "x" }, { name: "b_c", instructions: "y" }] };
    expect(codes(await inspect(manifest(), d))).toContain("TOOL_NAME_COLLISION");
  });

  it("4: warns that the runtime ignores an MCP descriptor's tools restriction", async () => {
    const d = { tools: [{ name: "desk", instructions: "Help.", tools: [{ url: "https://service.example/mcp", tools: ["read"] }] }] };
    const r = await inspect(manifest(), d);
    expect(r.checks.some((c) => c.status === "warn" && /restriction/i.test(c.detail) && /ignore/i.test(c.detail))).toBe(true);
  });

  it("5: refuses a link binding that is not an absolute http(s) URL, as the runtime does", async () => {
    const d = { link_slots: { x: {} }, links: { x: "/n" }, tools: [{ name: "desk", instructions: "Help.", tools: ["x"] }] };
    expect(codes(await inspect(manifest(), d))).toContain("DEFINITION_SHAPE");
  });

  it("6: refuses a REST toolbox method that is not a string", async () => {
    const d = { tools: [{ name: "desk", instructions: "Help.", tools: ["r"] }, { name: "r", toolbox: true, args: { url: "https://peer.example/api", method: 1 } }] };
    expect(codes(await inspect(manifest(), d))).toContain("DEFINITION_SHAPE");
  });

  it("7: refuses a non-positive or non-integer max_steps", async () => {
    for (const steps of [-1, 0, 1.5, "3"]) {
      const d = { max_steps: steps, tools: [{ name: "desk", instructions: "Help." }] };
      expect(codes(await inspect(manifest(), d)), String(steps)).toContain("DEFINITION_SHAPE");
    }
  });

  it("8: says when the runtime adds its own CRUSE instructions and tool", async () => {
    const d = { cruse: { version: 1 }, tools: [{ name: "desk", instructions: "Help." }] };
    const r = await inspect(manifest(), d);
    expect(r.checks.some((c) => /CRUSE/.test(c.detail) && /render_cruse/.test(c.detail))).toBe(true);
  });

  it("9: refuses a links.json that exists but is malformed, instead of silently ignoring it", async () => {
    const d = { link_slots: { x: {} }, tools: [{ name: "desk", instructions: "Help.", tools: ["x"] }] };
    const table = { ...routes(manifest(), d), "https://peer.example/agents/links.json": '{"networks":{"transit":{"x":"https://one.example/n","x":"https://two.example/n"}}}' };
    const r = await inspectPeer(peer, { fetch: fakeFetch(table) });
    expect(r.verdict).toBe("refused");
    // A missing links.json (404) is still fine.
    expect((await inspect(manifest(), definition())).verdict).toBe("unreviewed");
  });
});
