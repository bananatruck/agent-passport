import { canonicalJson } from "./canonical.js";
import { PassportError } from "./errors.js";
import { isObject, parseStrictJson } from "./json.js";
import { parsePeerUrl } from "./url.js";
import type { Change, NetworkSummary, PassportReport, PinEntry, PinFile, PinSnapshot } from "./types.js";

function snapshotOf(network: NetworkSummary): PinSnapshot {
  return structuredClone({
    frontMan: network.frontMan,
    agents: network.agents.map(a => ({ name: a.name, instructionsSha256: a.instructionsSha256, tools: a.tools.map(t => canonicalJson(t)), allowSly: a.allowSly })),
    origins: network.origins,
    links: network.links,
  });
}

/**
 * Pin files hold one small snapshot per reviewed partner, so they get their own key budget
 * instead of the per-artifact limit: about 1,000 partners with 40 agents each still fit.
 * serializePinFile enforces the same budget, so a file the publisher writes is always readable.
 */
export const PIN_FILE_LIMITS = { maxDepth: 64, maxKeys: 400_000 };

export function createPin(report: PassportReport, meta: { label?: string; reviewedBy?: string; note?: string; now?: Date } = {}): PinEntry {
  if (report.verdict === "refused" || report.checks.some(c => c.status === "fail") || !report.network || !report.digest || !report.networkUrl) throw new PassportError("PIN_FILE_INVALID", "Cannot pin a refused or incomplete network.");
  const network = report.network;
  return {
    network: report.networkUrl, label: meta.label ?? network.name, reviewedAt: (meta.now ?? new Date()).toISOString(), reviewedBy: meta.reviewedBy ?? "", note: meta.note ?? "",
    digest: { ...report.digest }, snapshot: snapshotOf(network),
  };
}

export function comparePin(report: PassportReport, pin: PinEntry): { status: "match" | "mismatch"; changes: Change[] } {
  const changes: Change[] = [];
  if (!report.digest || !report.network) return { status: "mismatch", changes: [{ kind: "definition-changed", detail: "The current network could not be inspected." }] };
  const current = snapshotOf(report.network);
  const before = pin.snapshot;
  const changed = (a: unknown, b: unknown) => canonicalJson(a) !== canonicalJson(b);
  if (before.frontMan !== current.frontMan) changes.push({ kind: "front-man-changed", detail: "The front agent changed.", before: before.frontMan, after: current.frontMan });
  for (const old of before.agents) if (!current.agents.some(a => a.name === old.name)) changes.push({ kind: "agent-removed", agent: old.name, detail: `Agent ${old.name} was removed.` });
  for (const agent of current.agents) {
    const old = before.agents.find(a => a.name === agent.name);
    if (!old) { changes.push({ kind: "agent-added", agent: agent.name, detail: `Agent ${agent.name} was added.` }); continue; }
    if (old.instructionsSha256 !== agent.instructionsSha256) changes.push({ kind: "instructions-changed", agent: agent.name, detail: `Effective instructions for ${agent.name} changed.`, before: old.instructionsSha256, after: report.network.agents.find(a => a.name === agent.name)?.instructions ?? "" });
    if (changed(old.tools, agent.tools)) changes.push({ kind: "tools-changed", agent: agent.name, detail: `Tools for ${agent.name} changed.`, before: canonicalJson(old.tools), after: canonicalJson(agent.tools) });
    if (changed(old.allowSly, agent.allowSly)) changes.push({ kind: "sly-changed", agent: agent.name, detail: `Private-context allow rules for ${agent.name} changed.`, before: canonicalJson(old.allowSly), after: canonicalJson(agent.allowSly) });
  }
  for (const origin of current.origins) if (!before.origins.includes(origin)) changes.push({ kind: "origin-added", detail: `Contact origin ${origin} was added.`, after: origin });
  for (const origin of before.origins) if (!current.origins.includes(origin)) changes.push({ kind: "origin-removed", detail: `Contact origin ${origin} was removed.`, before: origin });
  if (changed(before.links, current.links) || pin.digest.links !== report.digest.links) changes.push({ kind: "links-changed", detail: "Published or effective link bindings changed.", before: canonicalJson(before.links), after: canonicalJson(current.links) });
  if (pin.digest.manifestEntry !== report.digest.manifestEntry) changes.push({ kind: "manifest-entry-changed", detail: "The selected manifest entry or coded-tools declaration changed." });
  if (pin.digest.definition !== report.digest.definition) changes.push({ kind: "definition-changed", detail: "The effective network definition changed." });
  const sameNetwork = parsePeerUrl(pin.network).networkUrl === report.networkUrl;
  const match = sameNetwork && !changed(pin.digest, report.digest) && !changes.length;
  if (!match && !changes.length) changes.push({ kind: "definition-changed", detail: "The network URL or combined digest differs from the pin." });
  return { status: match ? "match" : "mismatch", changes };
}

export function findPin(pins: PinFile | null | undefined, networkUrl: string): PinEntry | null {
  let normalized: string;
  try { normalized = parsePeerUrl(networkUrl).networkUrl; } catch { return null; }
  return pins?.pins.find(pin => {
    try { return parsePeerUrl(pin.network).networkUrl === normalized; } catch { return false; }
  }) ?? null;
}

export function parsePinFile(text: string): PinFile {
  const invalid = (): never => { throw new PassportError("PIN_FILE_INVALID", "Invalid pin file; expected version 1 and complete, typed pin entries."); };
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
  const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
  try {
    const doc = parseStrictJson(text, PIN_FILE_LIMITS);
    if (!isObject(doc) || doc.version !== 1 || !Array.isArray(doc.pins)) return invalid();
    const pins: PinEntry[] = [];
    const seen = new Set<string>();
    for (const pin of doc.pins) {
      if (!isObject(pin) || typeof pin.network !== "string" || typeof pin.label !== "string" || typeof pin.reviewedAt !== "string" || typeof pin.reviewedBy !== "string" || typeof pin.note !== "string") return invalid();
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(pin.reviewedAt) || !Number.isFinite(Date.parse(pin.reviewedAt))) return invalid();
      const normalized = parsePeerUrl(pin.network).networkUrl;
      if (seen.has(normalized)) return invalid();
      seen.add(normalized);
      const d = pin.digest;
      if (!isObject(d) || !hash(d.manifestEntry) || !hash(d.definition) || !hash(d.links) || !hash(d.combined)) return invalid();
      const s = pin.snapshot;
      if (!isObject(s) || typeof s.frontMan !== "string" || !Array.isArray(s.agents) || !strings(s.origins) || !isObject(s.links) || !Object.values(s.links).every(v => typeof v === "string")) return invalid();
      const agents: PinEntry["snapshot"]["agents"] = [];
      const names = new Set<string>();
      for (const a of s.agents) {
        if (!isObject(a) || typeof a.name !== "string" || !a.name || names.has(a.name) || !hash(a.instructionsSha256) || !strings(a.tools) || !isObject(a.allowSly) || !strings(a.allowSly.toDownstream) || !strings(a.allowSly.toUpstream)) return invalid();
        names.add(a.name);
        agents.push({ name: a.name, instructionsSha256: a.instructionsSha256, tools: a.tools, allowSly: { toDownstream: a.allowSly.toDownstream, toUpstream: a.allowSly.toUpstream } });
      }
      const links: Record<string, string> = Object.create(null);
      for (const [key, val] of Object.entries(s.links)) { if (typeof val !== "string") return invalid(); links[key] = val; }
      pins.push({ network: normalized, label: pin.label, reviewedAt: pin.reviewedAt, reviewedBy: pin.reviewedBy, note: pin.note, digest: { manifestEntry: d.manifestEntry, definition: d.definition, links: d.links, combined: d.combined }, snapshot: { frontMan: s.frontMan, agents, origins: s.origins, links } });
    }
    return { version: 1, pins };
  } catch { return invalid(); }
}

export function serializePinFile(file: PinFile): string {
  const text = JSON.stringify({ version: 1, pins: [...file.pins].sort((a, b) => a.network < b.network ? -1 : a.network > b.network ? 1 : 0) }, null, 2) + "\n";
  // Refuse to write what parsePinFile would refuse to read.
  parseStrictJson(text, PIN_FILE_LIMITS);
  return text;
}
