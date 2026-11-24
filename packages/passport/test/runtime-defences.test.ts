// CodeRabbit raised findings in the vendored reference runtime (apps/site/public/runtime/), which this
// entry runs unmodified. Where a partner network could exploit one, Agent Passport defends from
// outside the runtime; these tests pin those defences. Others are pinned elsewhere:
// - leading-slash references resolved against the caller (engine.js:402): review3.test.ts finding 2
// - two tools with one dispatch name (runner.js:163): review2.test.ts finding 3
// - unbounded manifest and network downloads (remote.js:9): guard.test.ts, "loads a verified partner
//   from the verified bytes" (the runtime's own requests never reach the partner's server)
// - REST redirects and unbounded MCP responses: guard.test.ts, "round 4" tests
import { describe, expect, it } from "vitest";
import { inspectPeer } from "../src/index.js";
import { fakeFetch, manifest } from "./helpers.js";

describe("runtime findings defended from outside", () => {
  it("hocon.js:182: HOCON-only syntax never reaches the runtime's parser, because only strict JSON is accepted", async () => {
    const hoconOnly = "{ tools: [ { name: desk, instructions: help } ] }";
    const r = await inspectPeer("https://peer.example/agents/transit", {
      fetch: fakeFetch({
        "https://peer.example/agents/agent-manifest.json": JSON.stringify(manifest()),
        "https://peer.example/agents/transit.json": hoconOnly,
      }),
    });
    expect(r.verdict).toBe("refused");
    expect(r.checks.some((c) => c.code === "NOT_JSON")).toBe(true);
    // The guard-level half (the runtime parser is never called on it) is in guard.test.ts.
  });
});

describe("findings checked and found wrong, pinned so they are not raised again", () => {
  it("url.ts: a repeated slash in the peer path asks for the same manifest URL the runtime asks for", async () => {
    const target = new URL("https://peer.example/agents//transit");
    // engine.js resolveRemote, then remote.js fetchManifest, verbatim:
    const origin = new URL("./", target).href.replace(/\/$/, "");
    const runtimeManifestUrl = `${origin.replace(/\/$/, "")}/agent-manifest.json`;
    const requested: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      requested.push(String(input instanceof Request ? input.url : input));
      return new Response("", { status: 404 });
    }) as typeof fetch;
    await inspectPeer(target.href, { fetch: fetchImpl });
    expect(requested[0]).toBe(new URL(runtimeManifestUrl).href);
  });
});
