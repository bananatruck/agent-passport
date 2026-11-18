import { canonicalJson, sha256Hex } from "./canonical.js";
import { PassportError } from "./errors.js";
import { fetchArtifact } from "./fetch.js";
import { isObject, ownJsonValue, parseStrictJson } from "./json.js";
import type { JsonValue } from "./json.js";
import { DEFAULT_LIMITS } from "./limits.js";
import { effectiveConfig, summarizeNetwork } from "./network.js";
import { comparePin, findPin } from "./pins.js";
import { hiddenTextChecks, instructionSignals } from "./signals.js";
import type { Check, InspectOptions, PassportReport } from "./types.js";
import { parsePeerUrl, requireHttpUrl, resolveUrl } from "./url.js";

function contextChecks(): Check[] {
  return [
    { id: "runtime.guarantees", status: "info", category: "runtime", title: "Reference runtime guarantees", detail: "nsdeploy 53a787c with the vendored edits runs peers on the caller's router and model, keeps the visitor key local, applies caller step limits, filters sly_data and checks allowed_peers per hop. Agent Passport does not verify these runtime guarantees." },
    { id: "declared.publisher", status: "info", category: "declared", title: "Publisher claims", detail: "Brand, descriptions, llm_router, peer_policy, tags and sample queries are publisher claims. Domain ownership and legal identity are not verified." },
    { id: "signal.limitations", status: "info", category: "signal", title: "Signals are not proof", detail: "Heuristics are signals, not proof. A clean signal list does not mean the instructions are harmless." },
    { id: "not-checked.scope", status: "info", category: "not-checked", title: "Outside this check", detail: "No signatures, model behaviour evaluation, sandbox, MCP tool audit or protection from a malicious caller site is provided." },
  ];
}

export async function inspectPeer(input: string, options: InspectOptions = {}): Promise<PassportReport> {
  const report: PassportReport = { version: 1, input, networkUrl: null, siteBase: null, origin: null, networkName: null, verdict: "refused", summary: "The peer could not be inspected.", checks: contextChecks(), artifacts: {}, network: null, digest: null, pin: { status: "none", pin: null, changes: [] }, checkedAt: "" };
  let stage = "url";
  const pass = (id: string, title: string, detail: string) => report.checks.push({ id, title, detail, category: "verified", status: "pass" });
  try {
    const parsed = parsePeerUrl(input, options);
    Object.assign(report, parsed);
    pass("url", "Peer URL accepted", `Network ${parsed.networkName} at ${parsed.networkUrl}; manifest base ${parsed.siteBase}.`);
    const limits = { ...DEFAULT_LIMITS, ...options.limits };
    for (const [key, value] of Object.entries(limits)) if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) throw new PassportError("URL_INVALID", `Limit ${key} must be a positive integer.`);
    const ctx = { fetch: options.fetch ?? globalThis.fetch, limits, checks: report.checks };
    stage = "fetch.manifest";
    const manifestArtifact = await fetchArtifact(resolveUrl(parsed.siteBase, "agent-manifest.json"), "manifest", ctx);
    report.artifacts.manifest = manifestArtifact;
    pass(stage, "Manifest fetched", `Fetched ${manifestArtifact.bytes} bytes without redirects, credentials or referrer.`);
    stage = "manifest.json";
    const manifest = parseStrictJson(manifestArtifact.text, limits);
    stage = "manifest.shape";
    if (!isObject(manifest) || !Array.isArray(manifest.networks) || !manifest.networks.every(n => isObject(n) && typeof n.name === "string" && typeof n.front_man === "string" && typeof n.hocon === "string") || (manifest.coded_tools !== undefined && !isObject(manifest.coded_tools))) throw new PassportError("MANIFEST_SHAPE", "Manifest needs a networks array with string name, front_man and hocon fields, and an object coded_tools when present.");
    stage = "manifest.entry";
    const entries = manifest.networks.filter(isObject).filter(n => n.name === parsed.networkName);
    const entry = entries[0];
    if (!entry) throw new PassportError("NO_SUCH_NETWORK", `No network exactly named ${JSON.stringify(parsed.networkName)} is published.`);
    if (entries.length !== 1) throw new PassportError("MANIFEST_SHAPE", `Multiple manifest entries name ${JSON.stringify(parsed.networkName)}.`);
    pass(stage, "Exact network selected", `Selected only ${JSON.stringify(parsed.networkName)}.`);
    stage = "definition.url";
    if (typeof entry.hocon !== "string" || !entry.hocon) throw new PassportError("MANIFEST_SHAPE", "Definition hocon must be a non-empty string.");
    const definitionUrl = requireHttpUrl(resolveUrl(parsed.siteBase, entry.hocon), options.allowLoopbackHttp ?? true);
    if (definitionUrl.origin !== parsed.origin) {
      const accepted = await options.confirmDestination?.({ origin: definitionUrl.origin, url: definitionUrl.href, purpose: "network definition" });
      if (!accepted) throw new PassportError("DESTINATION_DECLINED", `Definition destination ${definitionUrl.origin} was not approved.`);
      pass("definition.destination", "Definition destination approved", `Approved extra origin ${definitionUrl.origin}.`);
    }
    stage = "fetch.definition";
    const definitionArtifact = await fetchArtifact(definitionUrl.href, "definition", ctx);
    report.artifacts.definition = definitionArtifact;
    pass(stage, "Definition fetched", `Fetched ${definitionArtifact.bytes} bytes without redirects, credentials or referrer.`);
    stage = "definition.json";
    const definition = parseStrictJson(definitionArtifact.text, limits);
    if (!isObject(definition)) throw new PassportError("DEFINITION_SHAPE", "Definition must be a JSON object.");
    let published: JsonValue = {};
    stage = "fetch.links";
    try {
      const artifact = await fetchArtifact(resolveUrl(parsed.siteBase, "/links.json"), "links", ctx);
      if (artifact.status === 200) {
        const doc = parseStrictJson(artifact.text, limits);
        published = ownJsonValue(ownJsonValue(doc, "networks"), parsed.networkName) || {};
        // The runtime accepts any JSON entry and spreads it before substitution.
        // An unusable binding is refused later by effective structure validation.
      }
      report.artifacts.links = artifact;
      report.checks.push({ id: stage, status: "info", category: "verified", title: artifact.status === 404 ? "No published links" : "Published links read", detail: artifact.status === 404 ? "links.json returned 404; the runtime uses no published bindings." : "The selected links.json entry is merged before runtime substitutions." });
    } catch (error) {
      published = {};
      report.checks.push({ id: stage, status: "info", category: "verified", title: "Published links unavailable", detail: `${error instanceof PassportError ? error.code + ": " : ""}${error instanceof Error ? error.message : String(error)} The runtime uses no published bindings; the guard must serve a 404.` });
    }
    stage = "definition.structure";
    const effective = effectiveConfig(definition, published);
    report.network = await summarizeNetwork(effective, manifest, entry, { siteBase: parsed.siteBase, origin: parsed.origin, name: parsed.networkName, checks: report.checks });
    if (!report.checks.some(c => c.status === "fail")) pass(stage, "Network structure checked", "Agent names, references, front agent and executable declarations passed structural checks.");
    report.checks.push(...hiddenTextChecks(entry, "manifest entry"), ...hiddenTextChecks(manifest.coded_tools, "manifest coded_tools"), ...hiddenTextChecks(definition, "raw definition"), ...hiddenTextChecks(effective, "effective definition"), ...instructionSignals(report.network.agents));
    stage = "digests";
    const manifestEntry = await sha256Hex(canonicalJson({ entry, coded_tools: manifest.coded_tools ?? null }));
    const definitionDigest = await sha256Hex(canonicalJson(effective));
    const links = await sha256Hex(canonicalJson(published));
    report.digest = { manifestEntry, definition: definitionDigest, links, combined: await sha256Hex(canonicalJson({ manifestEntry, definition: definitionDigest, links })) };
    pass(stage, "Effective content hashed", "SHA-256 covers the selected manifest entry and coded_tools, effective definition and selected published links.");
    const pin = findPin(options.pins, parsed.networkUrl);
    if (pin) report.pin = { pin, ...comparePin(report, pin) };
    report.verdict = report.checks.some(c => c.status === "fail") ? "refused" : report.pin.status === "mismatch" ? "changed" : report.pin.status === "match" ? "verified" : "unreviewed";
  } catch (error) {
    const failure = error instanceof PassportError ? error : new PassportError("DEFINITION_SHAPE", error instanceof Error ? error.message : String(error));
    report.checks.push({ id: stage, status: "fail", category: "verified", code: failure.code, title: "Peer refused", detail: failure.message });
    report.verdict = "refused";
  }
  report.summary = {
    refused: "The peer was refused because a fetch, format, structure or hidden-text check failed.",
    changed: "The peer passed structural checks but differs from the publisher's reviewed pin.",
    verified: "The peer passed structural checks and its effective content matches the publisher's reviewed pin.",
    unreviewed: "The peer passed structural checks and has no publisher review pin; explicit approval is required to load it.",
  }[report.verdict];
  report.checkedAt = (options.now?.() ?? new Date()).toISOString();
  return report;
}
