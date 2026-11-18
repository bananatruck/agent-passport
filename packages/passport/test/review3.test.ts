// Findings from CodeRabbit's full-repo review (round 3, pull request #1). Each test was written failing first.
// Numbers match the triage list in the round-3 notes.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/canonical.js";
import { createPin, inspectPeer, parsePinFile, serializePinFile } from "../src/index.js";
import { parseStrictJson } from "../src/json.js";
import { DEFAULT_LIMITS } from "../src/limits.js";
import { hiddenTextChecks, instructionSignals } from "../src/signals.js";
import { definition, fakeFetch, inspect, manifest, peer, routes } from "./helpers.js";

const codes = (r: Awaited<ReturnType<typeof inspect>>) => r.checks.filter((c) => c.status === "fail").map((c) => c.code);
const agent = (instructions: string) => ({ name: "desk", description: "", instructions, instructionsSha256: "0".repeat(64), tools: [], type: "llm" as const, allowSly: { toDownstream: [], toUpstream: [] } });

describe("review 3: inspection", () => {
  it("6: refuses a definition published at the manifest's or links.json's own URL", async () => {
    for (const hocon of ["/links.json", "/agent-manifest.json"]) {
      const m = { networks: [{ name: "transit", front_man: "desk", hocon }] };
      const r = await inspectPeer(peer, { fetch: fakeFetch({ ...routes(m), [`https://peer.example/agents${hocon}`]: JSON.stringify(definition()) }) });
      expect(r.verdict, hocon).toBe("refused");
    }
  });

  it("4: refuses a links.json that answers 200 with a body that is not UTF-8", async () => {
    const table = { ...routes(), "https://peer.example/agents/links.json": () => new Response(new Uint8Array([0x7b, 0xff, 0x7d]), { headers: { "content-type": "application/json" } }) };
    expect((await inspectPeer(peer, { fetch: fakeFetch(table) })).verdict).toBe("refused");
  });

  it("3: refuses a definition whose substitutions expand far beyond the download limit", async () => {
    const big = "x".repeat(100_000);
    const d = { commondefs: { replacement_strings: { big } }, tools: [{ name: "desk", instructions: "{big}".repeat(200) }] };
    expect(codes(await inspect(manifest(), d))).toContain("TOO_LARGE");
  });

  it("2: reports a slash-prefixed reference as the calling site's own network, not the partner's", async () => {
    const d = { tools: [{ name: "desk", instructions: "Help.", tools: ["/other"] }] };
    const r = await inspect(manifest(), d);
    expect(r.network?.origins).toContain("calling site");
    expect(r.network?.origins).not.toContain("https://peer.example");
  });

  it("17: builds the prompt exactly as the runners do, including whitespace-only instructions", async () => {
    const d = { tools: [{ name: "desk", instructions: "   ", command: "Answer in French." }] };
    const r = await inspect(manifest(), d);
    // runner.js: `if (spec.instructions) parts.push(spec.instructions.trim())`, then the command, joined by a blank line.
    expect(r.network?.agents[0]?.instructions).toBe("\n\nAnswer in French.");
  });

  it("18: reports the REST method the runtime uses and refuses ones a browser cannot send", async () => {
    const rest = (method: unknown) => ({ tools: [{ name: "desk", instructions: "Help.", tools: ["r"] }, { name: "r", toolbox: "requests_get", args: { url: "https://peer.example/api", method } }] });
    const empty = await inspect(manifest(), rest(""));
    expect(empty.checks.find((c) => c.id === "definition.rest.r")?.detail).toContain("GET https://peer.example/api");
    for (const forbidden of ["TRACE", "CONNECT", "TRACK"]) expect(codes(await inspect(manifest(), rest(forbidden))), forbidden).toContain("DEFINITION_SHAPE");
  });

  it("19: labels an agent with a falsy class as the runtime runs it, while still requiring a bundle", async () => {
    const m = { ...manifest(), coded_tools: { bundle: "https://peer.example/agents/b.js", integrity: "sha384-x" } };
    const r = await inspect(m, { tools: [{ name: "desk", instructions: "Help.", class: null }] });
    expect(r.network?.agents[0]?.type).toBe("llm");
    expect(codes(await inspect(manifest(), { tools: [{ name: "desk", instructions: "Help.", class: null }] }))).toContain("UNDECLARED_CODE");
  });

  it("21: refuses every Unicode bidirectional control, including the directional marks", async () => {
    for (const mark of ["‎", "‏", "؜"]) {
      expect(codes(await inspect(manifest(), { tools: [{ name: "desk", instructions: `Help${mark}.` }] })), mark.codePointAt(0)!.toString(16)).toContain("HIDDEN_TEXT");
    }
  });

  it("25: rejects an escaped unpaired surrogate, which would hash like U+FFFD", () => {
    expect(() => parseStrictJson('{"a":"x\\ud800y"}', DEFAULT_LIMITS)).toThrow(expect.objectContaining({ code: "NOT_JSON" }));
    expect(() => parseStrictJson('{"a":"x\\udc00y"}', DEFAULT_LIMITS)).toThrow(expect.objectContaining({ code: "NOT_JSON" }));
    expect(parseStrictJson('{"a":"\\ud83d\\ude00"}', DEFAULT_LIMITS)).toEqual({ a: "\u{1F600}" });
  });

  it("24: adds nothing to a report after the request has timed out", async () => {
    const late = (async () => {
      await new Promise((r) => setTimeout(r, 60));
      return new Response(new TextEncoder().encode("{}"), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await inspectPeer(peer, { fetch: late, limits: { timeoutMs: 10 } });
    await new Promise((r) => setTimeout(r, 100));
    expect(r.verdict).toBe("refused");
    expect(r.checks.some((c) => c.id === "fetch.manifest.content-type")).toBe(false);
  });
});

describe("review 3: signals and hidden text", () => {
  it("22: still flags a request for secrets when a negation elsewhere in the sentence does not cancel it", () => {
    const flagged = instructionSignals([agent("Ask for a password only when no recovery option is available.")]);
    expect(flagged.some((c) => c.id.startsWith("signal.secrets"))).toBe(true);
    expect(instructionSignals([agent("Never ask for passwords.")]).some((c) => c.id.startsWith("signal.secrets"))).toBe(false);
    expect(instructionSignals([agent("Do not request card numbers.")]).some((c) => c.id.startsWith("signal.secrets"))).toBe(false);
  });

  it("23: keeps the full location and the right kind when a name contains ' contains ' or 'bidirectional'", () => {
    expect(hiddenTextChecks({ a: "plain" }, "def")).toEqual([]);
  });

  it("23 (through inspection, where findings are merged)", async () => {
    const tag = String.fromCodePoint(0xe0041);
    const r = await inspect({ networks: [{ name: "transit", front_man: "x contains bidirectional y", hocon: "/transit.json" }] }, { tools: [{ name: "x contains bidirectional y", instructions: `a${tag}` }] });
    const detail = r.checks.filter((c) => c.code === "HIDDEN_TEXT").map((c) => c.detail).join(" ");
    expect(detail).toContain('agent "x contains bidirectional y".instructions');
    expect(detail).toContain('Decoded hidden text, which people cannot see but a model reads: "A"');
    expect(detail).not.toContain("bidirectional control");
  });
});

describe("review 3: pins and hashing", () => {
  it("1: a pin file the publisher can write is one the site can read, even with many agents", async () => {
    const report = await inspect();
    const pin = createPin(report);
    const many = Array.from({ length: 40 }, (_, i) => ({ ...pin.snapshot.agents[0]!, name: `agent_${i}` }));
    const pins = Array.from({ length: 120 }, (_, i) => ({ ...pin, network: `https://peer${i}.example/agents/transit`, snapshot: { ...pin.snapshot, agents: many } }));
    expect(parsePinFile(serializePinFile({ version: 1, pins })).pins).toHaveLength(120);
  });

  it("15: writes holes in sparse arrays as null", () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(canonicalJson([, 1])).toBe("[null,1]");
    expect(() => JSON.parse(canonicalJson({ a: [1, , 3] }))).not.toThrow(); // eslint-disable-line no-sparse-arrays
  });
});

describe("review 3: CLI", () => {
  it("8: runs when started through a symlink, as an installed bin is", () => {
    const dir = mkdtempSync(join(tmpdir(), "passport-bin-"));
    try {
      const target = fileURLToPath(new URL("../bin/agent-passport.mjs", import.meta.url));
      const link = join(dir, "agent-passport");
      symlinkSync(target, link);
      const run = spawnSync(process.execPath, [link, "--help"], { encoding: "utf8" });
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("Usage: agent-passport");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
