import { describe, expect, it } from "vitest";
import { comparePin, createPin, findPin, parsePinFile, serializePinFile } from "../src/index.js";
import type { ChangeKind, PassportReport } from "../src/types.js";
import { inspect, peer } from "./helpers.js";

const now = new Date("2026-11-17T00:00:00Z");

describe("review pins", () => {
  it("creates independent snapshots with metadata and normalized lookup", async () => {
    const report = await inspect();
    const pin = createPin(report, { label: "Transit", reviewedBy: "Publisher", note: "Reviewed all instructions", now });
    expect(pin).toMatchObject({ network: peer, label: "Transit", reviewedBy: "Publisher", reviewedAt: now.toISOString() });
    expect(comparePin(report, pin)).toEqual({ status: "match", changes: [] });
    expect(findPin({ version: 1, pins: [pin] }, "https://PEER.example:443/agents/transit")).toBe(pin);
    expect(findPin(null, peer)).toBeNull();
    expect(findPin({ version: 1, pins: [pin] }, "bad URL")).toBeNull();
    report.network!.agents[0]!.allowSly.toDownstream.push("private");
    expect(pin.snapshot.agents[0]?.allowSly.toDownstream).toEqual([]);
  });
  it("refuses to create pins for refused or incomplete inspections", async () => {
    const report = await inspect();
    expect(() => createPin({ ...report, verdict: "refused" })).toThrow();
    expect(() => createPin({ ...report, digest: null })).toThrow();
  });
  it("covers verified, changed and refused even when a pin exists", async () => {
    const initial = await inspect();
    const pins = { version: 1 as const, pins: [createPin(initial, { now })] };
    expect((await inspect(undefined, undefined, undefined, { pins })).verdict).toBe("verified");
    expect((await inspect(undefined, { tools: [{ name: "desk", instructions: "New prompt" }] }, undefined, { pins })).verdict).toBe("changed");
    expect((await inspect(undefined, { tools: [] }, undefined, { pins })).verdict).toBe("refused");
  });
  const changes: [ChangeKind, (report: PassportReport) => void][] = [
    ["front-man-changed", r => { r.network!.frontMan = "new"; }],
    ["agent-added", r => { r.network!.agents.push({ ...r.network!.agents[0]!, name: "new" }); }],
    ["agent-removed", r => { r.network!.agents = []; }],
    ["instructions-changed", r => { r.network!.agents[0]!.instructionsSha256 = "a".repeat(64); r.network!.agents[0]!.instructions = "NEW EFFECTIVE INSTRUCTIONS"; }],
    ["tools-changed", r => { r.network!.agents[0]!.tools.push({ ref: "/new", kind: "remote", origin: "https://peer.example" }); }],
    ["sly-changed", r => { r.network!.agents[0]!.allowSly.toUpstream.push("*"); }],
    ["origin-added", r => { r.network!.origins.push("https://new.example"); }],
    ["origin-removed", r => { r.network!.origins = []; }],
    ["links-changed", r => { r.network!.links.new = "https://new.example/net"; }],
    ["manifest-entry-changed", r => { r.digest!.manifestEntry = "a".repeat(64); }],
    ["definition-changed", r => { r.digest!.definition = "a".repeat(64); }],
  ];
  it.each(changes)("explains %s", async (kind, mutate) => {
    const report = await inspect();
    report.network!.origins = ["https://old.example"];
    const pin = createPin(report, { now });
    mutate(report);
    const compared = comparePin(report, pin);
    expect(compared.status).toBe("mismatch");
    const change = compared.changes.find(c => c.kind === kind);
    expect(change).toBeDefined();
    if (kind === "instructions-changed") expect(change?.after).toBe("NEW EFFECTIVE INSTRUCTIONS");
  });
  it("explains a combined-digest mismatch even with unchanged snapshots", async () => {
    const report = await inspect();
    const pin = createPin(report);
    report.digest!.combined = "a".repeat(64);
    expect(comparePin(report, pin).status).toBe("mismatch");
    expect(comparePin({ ...report, digest: null }, pin).status).toBe("mismatch");
  });
  it("round trips strict typed files, sorts network pins and ends with a newline", async () => {
    const pin = createPin(await inspect(), { now });
    const z = { ...pin, network: "https://z.example/net" };
    const file = { version: 1 as const, pins: [z, pin] };
    const text = serializePinFile(file);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('\n  "version": 1,');
    expect(parsePinFile(text).pins.map(p => p.network)).toEqual([peer, z.network]);
    expect(file.pins[0]).toBe(z);
  });
  it.each(["not json", '{"version":1,"version":1,"pins":[]}', '{"version":2,"pins":[]}', '{"version":1,"pins":{}}', '{"version":1,"pins":[{}]}'])("rejects invalid pin file %s", text => expect(() => parsePinFile(text)).toThrow(expect.objectContaining({ code: "PIN_FILE_INVALID" })));
  it("validates every nested field type", async () => {
    const valid = { version: 1, pins: [createPin(await inspect(), { now })] };
    const invalidValues: [string[], unknown][] = [
      [["network"], 1], [["label"], null], [["reviewedAt"], "not a date"], [["reviewedBy"], false], [["note"], []],
      [["digest"], []], [["digest", "manifestEntry"], 1], [["digest", "definition"], "bad hash"], [["digest", "links"], null], [["digest", "combined"], {}],
      [["snapshot"], []], [["snapshot", "frontMan"], 1], [["snapshot", "agents"], null], [["snapshot", "origins"], [1]], [["snapshot", "links"], { x: 1 }],
      [["snapshot", "agents", "0", "name"], 1], [["snapshot", "agents", "0", "instructionsSha256"], false], [["snapshot", "agents", "0", "tools"], [1]], [["snapshot", "agents", "0", "allowSly"], null], [["snapshot", "agents", "0", "allowSly", "toDownstream"], [1]], [["snapshot", "agents", "0", "allowSly", "toUpstream"], {}],
    ];
    for (const [path, value] of invalidValues) {
      const object = JSON.parse(JSON.stringify(valid));
      let target = object.pins[0];
      for (const key of path.slice(0, -1)) target = target[key];
      target[path.at(-1)!] = value;
      expect(() => parsePinFile(JSON.stringify(object)), path.join(".")).toThrow(expect.objectContaining({ code: "PIN_FILE_INVALID" }));
    }
    expect(() => parsePinFile(JSON.stringify({ ...valid, pins: [...valid.pins, ...valid.pins] }))).toThrow();
  });
});
