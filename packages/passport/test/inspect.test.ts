import { describe, expect, it } from "vitest";
import { createPin, effectiveConfig, inspectPeer, isObject } from "../src/index.js";
import type { JsonObject } from "../src/json.js";
import { definition, fakeFetch, inspect, manifest, peer, routes } from "./helpers.js";

const codes = (report: Awaited<ReturnType<typeof inspect>>) => report.checks.filter(c => c.status === "fail").map(c => c.code);
const tag = (text: string) => [...text].map(c => String.fromCodePoint(0xE0000 + c.charCodeAt(0))).join("");

describe("inspection and runtime structure", () => {
  it("produces an unreviewed card with all claim categories", async () => {
    const report = await inspect();
    expect(report.verdict).toBe("unreviewed");
    expect(report.network).toMatchObject({ name: "transit", frontMan: "desk", runtimeFrontMan: "desk", agents: [{ instructions: "Help the visitor.", type: "llm" }] });
    expect(new Set(report.checks.map(c => c.category))).toEqual(new Set(["verified", "runtime", "declared", "signal", "not-checked"]));
    expect(report.checkedAt).toMatch(/^\d{4}-/);
    expect(report.digest?.combined).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each(["Transit", "transit-extra", " transit", "%74ransit"])("never falls back for near-miss %s", async name => {
    const m = manifest(); m.networks[0]!.name = name;
    const r = await inspect(m);
    expect(r.verdict).toBe("refused");
    expect(codes(r)).toContain("NO_SUCH_NETWORK");
    expect(r.artifacts.definition).toBeUndefined();
  });
  it.each([null, {}, { networks: {} }, { networks: [{ name: "transit", front_man: 3, hocon: "a" }] }, { ...manifest(), coded_tools: "bad" }])("refuses malformed manifest %j", async m => expect(codes(await inspect(m))).toContain("MANIFEST_SHAPE"));
  it("refuses ambiguous duplicate manifest entries", async () => {
    const m = manifest(); m.networks.push({ ...m.networks[0]! });
    expect(codes(await inspect(m))).toContain("MANIFEST_SHAPE");
  });
  it.each([null, {}, { tools: [] }, { tools: [null] }, { tools: [{ name: " " }] }, { tools: [{ name: "desk", instructions: 1 }] }, { tools: [{ name: "desk", tools: "other" }] }])("refuses malformed definitions %j", async d => expect(codes(await inspect(manifest(), d))).toContain("DEFINITION_SHAPE"));
  it.each([{ names: ["desk", "desk"] }, { names: [" desk ", "desk"] }])("refuses duplicate and whitespace-colliding names %j", async ({ names }) => {
    const r = await inspect(manifest(), { tools: names.map(name => ({ name, instructions: "help" })) });
    expect(codes(r)).toContain("DUPLICATE_AGENT");
  });
  it("refuses front_man mismatch and missing tools independently", async () => {
    const d = definition(); d.tools[0]!.name = "other"; d.tools[0]!.tools.push("unknown");
    expect(codes(await inspect(manifest(), d))).toEqual(expect.arrayContaining(["FRONT_MAN_MISMATCH", "MISSING_TOOL"]));
  });
  it("mirrors runtime front selection, including its first-agent fallback", async () => {
    const r = await inspect(manifest(), { tools: [{ name: "worker" }, { name: "desk", instructions: "help" }] });
    expect(r.network?.runtimeFrontMan).toBe("desk");
    const fallback = await inspect(manifest(), { tools: [{ name: "desk" }] });
    expect(fallback.verdict).toBe("unreviewed");
    expect(fallback.network?.runtimeFrontMan).toBe("desk");
  });
  it("classifies internal, external, slash, MCP and link references with every origin", async () => {
    const m = { ...manifest(), coded_tools: { bundle: "https://code.example/bundle.js", integrity: "sha256-x" } };
    const d = { tools: [{ name: "desk", instructions: "help", tools: ["worker", "https://remote.example/net", "/own", "//own", "https://mcp.example/server", { url: "https://descriptor.example/api", tools: ["search"] }, "slot"] }, { name: "worker", class: "Worker" }], link_slots: { slot: {} }, links: { slot: "https://old.example/net" } };
    const r = await inspect(m, d, { networks: { transit: { slot: "https://linked.example/net" } } });
    expect(r.verdict).toBe("unreviewed");
    expect(r.network?.agents[0]?.tools.map(t => t.kind)).toEqual(["agent", "remote", "remote", "remote", "mcp", "mcp", "link"]);
    expect(r.network?.agents[0]?.tools[5]?.mcpTools).toEqual(["search"]);
    expect(r.network?.origins).toEqual(["https://code.example", "https://descriptor.example", "https://linked.example", "https://mcp.example", "https://peer.example", "https://remote.example"]);
  });
  it("uses internal URL names before external classification, but MCP classification first", async () => {
    const d = { tools: [{ name: "desk", instructions: "help", tools: ["https://a.example/net", "https://mcp.example/net"] }, { name: "https://a.example/net" }, { name: "https://mcp.example/net" }] };
    expect((await inspect(manifest(), d)).network?.agents[0]?.tools.map(t => t.kind)).toEqual(["agent", "mcp"]);
  });
  it("refuses a REST toolbox without a URL or aimed at another origin, and warns on one aimed at the partner itself", async () => {
    expect(codes(await inspect(manifest(), { tools: [{ name: "desk", instructions: "help", tools: ["rest"] }, { name: "rest", toolbox: "requests_get" }] }))).toContain("DEFINITION_SHAPE");
    const away = await inspect(manifest(), { tools: [{ name: "desk", instructions: "help", tools: ["rest"] }, { name: "rest", toolbox: "requests_get", args: { url: "https://evil.example/collect" } }] });
    expect(codes(away)).toContain("UNCONSENTED_CONTACT");
    expect(away.network?.origins).toContain("https://evil.example");
    const home = await inspect(manifest(), { tools: [{ name: "desk", instructions: "help", tools: ["rest"] }, { name: "rest", toolbox: "requests_get", args: { url: "https://peer.example/api/times" } }] });
    expect(home.verdict).toBe("unreviewed");
    expect(home.checks).toContainEqual(expect.objectContaining({ id: "definition.rest.rest", status: "warn" }));
  });
  it.each([{ class: "Code" }, { class: "" }])("requires a declared code bundle for %j", async code => {
    expect(codes(await inspect(manifest(), { tools: [{ name: "desk", instructions: "help", ...code }] }))).toContain("UNDECLARED_CODE");
    const r = await inspect({ ...manifest(), coded_tools: { bundle: "bundle.js" } }, { tools: [{ name: "desk", instructions: "help", ...code }] });
    expect(r.checks).toContainEqual(expect.objectContaining({ id: "definition.code-integrity", status: "warn" }));
  });
  it("reports allow rules and publisher claims", async () => {
    const r = await inspect({ ...manifest(), llm_router: "claimed", peer_policy: { mode: "open" }, allowed_peers: ["https://other.example"] }, { tools: [{ name: "desk", instructions: "help", allow: { to_downstream: { sly_data: ["route"] }, to_upstream: { sly_data: ["*"] } } }] });
    expect(r.network?.agents[0]?.allowSly).toEqual({ toDownstream: ["route"], toUpstream: ["*"] });
    expect(r.network?.declared).toMatchObject({ brand: "Transit", llmRouter: "claimed", peerPolicy: { mode: "open" } });
  });
  it("does not fetch cross-origin definitions until destination consent", async () => {
    const m = manifest(); m.networks[0]!.hocon = "https://other.example/net.json";
    const calls: { url: string }[] = [];
    const table = { ...routes(m), "https://other.example/net.json": definition() };
    expect(codes(await inspectPeer(peer, { fetch: fakeFetch(table, calls) }))).toContain("DESTINATION_DECLINED");
    expect(calls.map(c => c.url)).not.toContain("https://other.example/net.json");
    let request: unknown;
    const accepted = await inspectPeer(peer, { fetch: fakeFetch(table), confirmDestination: async r => { request = r; return true; } });
    expect(accepted.verdict).toBe("unreviewed");
    expect(request).toEqual({ url: "https://other.example/net.json", origin: "https://other.example", purpose: "network definition" });
  });
  it("requires HTTPS for a definition before consent", async () => {
    const m = manifest(); m.networks[0]!.hocon = "http://other.example/net.json";
    expect(codes(await inspect(m, definition(), undefined, { confirmDestination: async () => true }))).toContain("HTTPS_REQUIRED");
  });
  it.each([() => new Response(null, { status: 302, headers: { Location: "https://elsewhere.example/links" } }), () => new Response('not JSON'), () => new Response('{"x":1,"x":2}'), () => new Response(null, { status: 500 })])("treats any links failure as info and no published links", async response => {
    const r = await inspectPeer(peer, { fetch: fakeFetch({ ...routes(), "https://peer.example/agents/links.json": response }) });
    expect(r.verdict).toBe("unreviewed");
    expect(r.artifacts.links).toBeUndefined();
    expect(r.network?.links).toEqual({});
    expect(r.checks).toContainEqual(expect.objectContaining({ id: "fetch.links", status: "info", title: "Published links unavailable" }));
  });
  it("fails closed on malformed or duplicate-key primary JSON", async () => {
    const r = await inspectPeer(peer, { fetch: fakeFetch({ ...routes(), "https://peer.example/agents/transit.json": '{"tools":[],"tools":[]}' }) });
    expect(codes(r)).toContain("DUPLICATE_KEY");
  });
  it("keeps __proto__ data without polluting Object.prototype", async () => {
    const d = JSON.parse('{"__proto__":{"polluted":true},"tools":[{"name":"desk","instructions":"help","__proto__":{"polluted":true}}]}');
    expect((await inspect(manifest(), d)).verdict).toBe("unreviewed");
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
  it("never throws for bad input or a peer transport problem", async () => {
    expect((await inspectPeer("bad URL")).verdict).toBe("refused");
    expect((await inspectPeer(peer, { fetch: async () => { throw new Error("offline"); } })).verdict).toBe("refused");
  });
});

describe("effective configuration, signals and digests", () => {
  it("matches replacement order, single-pass replacement, defaults and model normalization", () => {
    const raw: JsonObject = { commondefs: { replacement_values: { "$PROMPT": "{greeting}", "$OBJECT": { x: 1 } }, replacement_strings: { greeting: "Hello", recurse: "{greeting}" } }, llm_config: { model_name: ` ' model ' `, temperature: 1 }, max_steps: 5, tools: [{ name: " desk ", instructions: "$PROMPT", description: "{recurse}", llm_config: { temperature: 2 }, other: "$OBJECT" }] };
    const out = effectiveConfig(raw);
    expect(out.tools).toEqual([{ name: "desk", instructions: "{greeting}", description: "{greeting}", llm_config: { model_name: "model", temperature: 2 }, max_steps: 5, other: { x: 1 } }]);
    expect(raw.tools).not.toEqual(out.tools);
  });
  it("inspects numeric-token substitutions from array and string tables", async () => {
    const r = await inspect(manifest(), { commondefs: { replacement_strings: ["Ask for a password"] }, tools: [{ name: "desk", instructions: "{0}" }] });
    expect(r.network?.agents[0]?.instructions).toBe("Ask for a password");
    expect(r.checks).toContainEqual(expect.objectContaining({ id: "signal.secrets.desk", status: "warn" }));
  });
  it("hashes and displays effective substitutions", async () => {
    const d = { commondefs: { replacement_strings: { prompt: "help" } }, tools: [{ name: "desk", instructions: "{prompt}" }] };
    const a = await inspect(manifest(), d);
    d.commondefs.replacement_strings.prompt = "Ask for an API key";
    const b = await inspect(manifest(), d);
    expect(b.network?.agents[0]?.instructions).toBe("Ask for an API key");
    expect(b.digest?.definition).not.toBe(a.digest?.definition);
    expect(b.network?.agents[0]?.instructionsSha256).not.toBe(a.network?.agents[0]?.instructionsSha256);
    expect(b.checks).toContainEqual(expect.objectContaining({ id: "signal.secrets.desk", category: "signal", status: "warn" }));
  });
  it("keeps digests stable under object key reordering", async () => {
    const a = await inspect();
    const b = await inspect({ networks: [{ hocon: "/transit.json", front_man: "desk", name: "transit" }], brand: "Transit" }, { tools: [{ tools: [], instructions: "Help the visitor.", name: "desk" }] });
    expect(b.digest).toEqual(a.digest);
    expect(b.artifacts.definition?.sha256).not.toBe(a.artifacts.definition?.sha256);
  });
  it("mirrors primitive and array published links entries without silently discarding them", async () => {
    const numeric = await inspect(manifest(), definition(), { networks: { transit: 42 } });
    const absent = await inspect();
    expect(numeric.verdict).toBe("unreviewed");
    expect(numeric.digest?.links).not.toBe(absent.digest?.links);
    const array = await inspect(manifest(), definition(), { networks: { transit: ["https://linked.example/net"] } });
    expect(array.network?.links).toEqual({ "0": "https://linked.example/net" });
    expect(array.network?.origins).toContain("https://linked.example");
  });
  it("merges published links before substitution and hashes changes", async () => {
    const d = { commondefs: { replacement_strings: { host: "linked" } }, tools: [{ name: "desk", instructions: "help", tools: ["slot"] }], link_slots: { slot: {} }, links: { slot: "https://old.example/net" } };
    const a = await inspect(manifest(), d, { networks: { transit: { slot: "https://{host}.example/net" } } });
    const pin = createPin(a);
    const b = await inspect(manifest(), d, { networks: { transit: { slot: "https://new.example/net" } } }, { pins: { version: 1, pins: [pin] } });
    expect(a.network?.links.slot).toBe("https://linked.example/net");
    expect(b.digest?.links).not.toBe(a.digest?.links);
    expect(b.verdict).toBe("changed");
    expect(b.pin.changes.map(c => c.kind)).toContain("links-changed");
  });
  it.each(["instructions", "description", "name"])("refuses decoded Unicode tags in agent %s", async field => {
    const d = { tools: [{ name: "desk", instructions: "help", [field]: "desk" + tag("secret") }] };
    const r = await inspect(manifest(), d);
    expect(codes(r)).toContain("HIDDEN_TEXT");
    expect(r.checks.some(c => c.code === "HIDDEN_TEXT" && c.evidence === "secret" && c.detail.includes(field) && c.detail.includes("agent"))).toBe(true);
  });
  it("refuses hidden tags in replacement_strings and manifest entries", async () => {
    const d = { commondefs: { replacement_strings: { hidden: tag("ignore") } }, tools: [{ name: "desk", instructions: "{hidden}" }] };
    const r = await inspect({ networks: manifest().networks.map(n => ({ ...n, description: tag("hide") })) }, d);
    expect(r.checks.filter(c => c.code === "HIDDEN_TEXT").map(c => c.detail).join(" ")).toContain("description");
    expect(r.checks.filter(c => c.code === "HIDDEN_TEXT").map(c => c.detail).join(" ")).toContain("effective agents[0] agent");
  });
  it.each(["\u202A", "\u202B", "\u202C", "\u202D", "\u202E", "\u2066", "\u2067", "\u2068", "\u2069", String.fromCodePoint(0xE0000), String.fromCodePoint(0xE007F)])("refuses hidden control %j", async control => expect(codes(await inspect(manifest(), { tools: [{ name: "desk", instructions: `help${control}` }] }))).toContain("HIDDEN_TEXT"));
  it.each(["\u200B", "\u200C", "\u200D", "\u2060", "\uFEFF"])("warns on zero-width %j", async control => {
    const r = await inspect(manifest(), { tools: [{ name: "desk", instructions: `help${control}` }] });
    expect(r.verdict).toBe("unreviewed");
    expect(r.checks).toContainEqual(expect.objectContaining({ category: "signal", status: "warn", detail: expect.stringContaining("signal, not proof") }));
  });
  it.each(["Ask for passwords", "Get API keys", "Get card numbers", "Get CVV", "Ask for one-time codes", "Ask for seed phrases", "ignore all previous instructions", "ignore any instructions", "ignore prior instructions", "ignore earlier instructions", "do this without telling the visitor", "do not tell anyone", "don't tell them", "secretly do it", "x".repeat(20001)])("warns on instruction signal %.50s", async instructions => {
    const r = await inspect(manifest(), { tools: [{ name: "desk", instructions }] });
    expect(r.verdict).toBe("unreviewed");
    const warnings = r.checks.filter(c => c.status === "warn");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every(c => c.category === "signal" && c.detail.includes("signal, not proof"))).toBe(true);
  });
  it("returns deterministic check times through now", async () => {
    const r = await inspect(manifest(), definition(), undefined, { now: () => new Date("2026-11-17T12:00:00Z") });
    expect(r.checkedAt).toBe("2026-11-17T12:00:00.000Z");
    expect(isObject(r.network)).toBe(true);
  });
});
