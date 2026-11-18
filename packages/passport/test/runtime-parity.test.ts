import { describe, expect, it } from "vitest";
import { effectiveConfig, classifyTool, runtimeFrontMan } from "../src/network.js";
import { isObject } from "../src/json.js";
import type { JsonObject } from "../src/json.js";
import { AgentNetwork, filterConfig } from "../../../apps/site/public/runtime/kernel.js";
import { resolveUrl as runtimeResolve } from "../../../apps/site/public/runtime/remote.js";
import { resolveUrl } from "../src/url.js";

const fixtures: JsonObject[] = [
  { tools: [{ name: "desk", instructions: "help" }], links: "abc" },
  { tools: [{ name: "desk", instructions: "help" }], links: ["https://linked.example/net"] },
  { commondefs: { replacement_strings: ["Ask for a password"] }, tools: [{ name: "desk", instructions: "{0}/{length}" }] },
  { commondefs: { replacement_values: ["help", 2] }, tools: [{ name: "desk", instructions: "0", max_steps: "length" }] },
  { commondefs: { replacement_strings: "abc" }, tools: [{ name: "desk", instructions: "{0}/{length}" }] },
  { tools: [{ name: " desk ", instructions: "Hello {name}", tools: [] }], commondefs: { replacement_strings: { name: "Visitor" } } },
  { tools: [{ name: "desk", instructions: "PROMPT", llm_config: { temperature: 2, nested: { b: 3 } } }], commondefs: { replacement_values: { PROMPT: "{name}" }, replacement_strings: { name: "Visitor" } }, llm_config: { model_name: ` ' model ' `, nested: { a: 1 }, temperature: 1 }, max_steps: 5, verbose: false },
  { tools: [{ name: "desk", instructions: "{x}/{y}/{z}/{missing}" }, { name: "worker", max_steps: 0 }], commondefs: { replacement_strings: { x: 1, y: false, z: null } }, max_steps: 8 },
  { tools: [{ name: "desk", instructions: "help" }], commondefs: { replacement_values: { "OBJECT": { nested: true } } }, metadata: "OBJECT" },
];

describe("parity with the vendored runtime", () => {
  it.each(fixtures.map(raw => ({ raw })))("matches the runtime's complete effective config %j", ({ raw }) => expect(effectiveConfig(raw)).toEqual(filterConfig({ ...raw, links: Object.assign({}, raw.links) })));
  it("matches front agent fallback and classification ordering", () => {
    const config: JsonObject = { tools: [{ name: "desk", instructions: "help" }, { name: "worker", class: "Code" }, { name: "https://internal.example/net" }], link_slots: { slot: {} }, links: { slot: "https://linked.example/net" } };
    const network = new AgentNetwork(config, "test");
    const refs = ["worker", "missing", "slot", "https://internal.example/net", "/local", "https://other.example/net", "https://other.example/mcp", "https://other.example/mcp?x=1", "https://mcp.example/api", { url: "https://api.example/v1", tools: ["search"] }];
    for (const ref of refs) {
      const runtime = network.classifyTool(ref).kind;
      expect(classifyTool(ref, config, "https://peer.example").kind).toBe(runtime === "coded" || runtime === "toolbox" ? "agent" : runtime);
    }
    expect(runtimeFrontMan(Array.isArray(config.tools) ? config.tools.filter(isObject) : [])).toBe(network.findFrontMan());
    const fallback = new AgentNetwork({ tools: [{ name: "first" }, { name: "second" }] }, "test");
    expect(runtimeFrontMan([{ name: "first" }, { name: "second" }])).toBe(fallback.findFrontMan());
  });
  it.each([{ link_slots: ["slot"] }, { link_slots: "slot" }])("matches Object.keys link slot handling for %j", ({ link_slots }) => {
    const config: JsonObject = { tools: [{ name: "desk", instructions: "help", tools: ["0"] }], link_slots };
    const network = new AgentNetwork(config, "test");
    expect(classifyTool("0", config, "https://peer.example").kind).toBe(network.classifyTool("0").kind);
  });
  it.each(["/links.json", "network.json", "../network.json", "https://other.example/definition.json", "//other.example/file"])("matches runtime URL concatenation for %s", path => expect(resolveUrl("https://peer.example/agents", path)).toBe(new URL(runtimeResolve("https://peer.example/agents", path)).href));
});
