import { sha256Hex } from "./canonical.js";
import { PassportError } from "./errors.js";
import { isObject, ownJsonValue } from "./json.js";
import type { JsonObject, JsonValue } from "./json.js";
import type { AgentSummary, Check, NetworkSummary, ToolRef } from "./types.js";
import { requireHttpUrl, resolveUrl } from "./url.js";

const DEFAULT_KEYS = ["llm_config", "verbose", "max_steps", "max_iterations", "max_execution_seconds", "max_attempts", "error_formatter", "error_fragments"];
const object = (v: JsonValue | undefined): JsonObject => isObject(v) ? v : Object.create(null);
export const stringList = (v: unknown): string[] => Array.isArray(v) && v.every(x => typeof x === "string") ? v : [];

/** JavaScript object spread and own-property lookup also accept arrays and strings. */
function spread(value: JsonValue | undefined): JsonObject {
  if (Array.isArray(value)) return Object.fromEntries(value.map((v, i) => [String(i), v]));
  if (typeof value === "string") return Object.fromEntries(value.split("").map((v, i) => [String(i), v]));
  return object(value);
}

function merge(a: JsonObject, b: JsonObject, spend: (chars: number) => void): JsonObject {
  const out: JsonObject = Object.assign(Object.create(null), a);
  for (const [key, value] of Object.entries(a)) {
    if (!Object.hasOwn(b, key)) spend(JSON.stringify({ [key]: value }).length);
  }
  for (const [key, value] of Object.entries(b)) {
    const previous = out[key];
    out[key] = isObject(previous) && isObject(value) ? merge(previous, value, spend) : value;
  }
  return out;
}

/** Default budget, in characters, for the definition after substitutions: 16 times the download limit. */
export const EXPANSION_BUDGET = 16 * 1048576;

export function effectiveConfig(raw: JsonObject, published: JsonValue = {}, budget = EXPANSION_BUDGET): JsonObject {
  // A small definition can reuse a long replacement many times; stop before materialising it.
  let produced = 0;
  const spend = (chars: number) => {
    produced += chars;
    if (produced > budget) throw new PassportError("TOO_LARGE", `The definition expands to more than ${budget} characters after the runtime's substitutions.`);
  };
  const config = structuredClone(raw);
  config.links = { ...spread(config.links), ...spread(published) };
  const common = object(config.commondefs);
  const strings = common.replacement_strings;
  const values = common.replacement_values;
  const walk = (v: JsonValue): JsonValue => {
    if (Array.isArray(v)) return v.map(walk);
    if (isObject(v)) {
      const out: JsonObject = Object.create(null);
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    if (typeof v !== "string") return v;
    const replacement = ownJsonValue(values, v);
    if (replacement !== undefined) {
      spend(JSON.stringify(replacement)?.length ?? 4);
      return replacement;
    }
    const out = v.replace(/\{([A-Za-z0-9_]+)\}/g, (match: string, key: string) => {
      const replacement = ownJsonValue(strings, key);
      if (replacement === undefined) return match;
      const text = String(replacement);
      spend(text.length);
      return text;
    });
    spend(v.length);
    return out;
  };
  const effective = walk(config);
  if (!isObject(effective)) throw new PassportError("DEFINITION_SHAPE", "Definition must be an object.");
  const normalize = (llm: JsonValue | undefined) => {
    if (isObject(llm) && typeof llm.model_name === "string") {
      let model = llm.model_name.trim();
      while (model.length >= 2 && ((model.startsWith('"') && model.endsWith('"')) || (model.startsWith("'") && model.endsWith("'")))) model = model.slice(1, -1).trim();
      llm.model_name = model;
    }
  };
  for (const agent of Array.isArray(effective.tools) ? effective.tools : []) {
    if (!isObject(agent)) continue;
    for (const key of DEFAULT_KEYS) {
      if (Object.hasOwn(effective, key)) {
        const def = effective[key];
        const local = agent[key];
        // Local values were charged during substitution. Charge only defaults that survive.
        if (isObject(def) && isObject(local)) agent[key] = merge(def, local, spend);
        else if (!Object.hasOwn(agent, key) && def !== undefined) {
          spend(JSON.stringify(def).length);
          agent[key] = structuredClone(def);
        }
      }
    }
    if (typeof agent.name === "string") agent.name = agent.name.trim();
    normalize(agent.llm_config);
  }
  normalize(effective.llm_config);
  return effective;
}

export function runtimeFrontMan(agents: JsonObject[]): string | null {
  const front = agents.find(a => a.instructions && !a.class && !a.toolbox) ?? agents[0];
  return typeof front?.name === "string" ? front.name : null;
}

export function isMcpRef(ref: string): boolean {
  if (!ref.startsWith("http://") && !ref.startsWith("https://")) return false;
  const lower = ref.toLowerCase();
  return lower.includes("/mcp/") || lower.endsWith("/mcp") || lower.includes("//mcp.") || lower.includes(".mcp.");
}

/**
 * Where the runtime will really send a remote reference. resolveRemote resolves it against the
 * calling site's base, not the partner's: "/x" names one of the calling site's own networks, and
 * "//host/x" names another host on the calling site's scheme (taken here as https).
 */
export const CALLING_SITE = "calling site";
function remoteOrigin(ref: string): string {
  // The URL parser reads "\\" as "/" in http(s) URLs, so "/\\host/x" is the network path "//host/x".
  ref = ref.replace(/\\/g, "/");
  if (ref.startsWith("//")) return contactOrigin(`https:${ref}`, "");
  if (ref.startsWith("/")) return CALLING_SITE;
  return contactOrigin(ref, "");
}

function contactOrigin(url: string, peerOrigin: string): string {
  // The runtime treats every slash-prefixed ref as origin + ref, even '//...'.
  const target = url.startsWith("/") ? peerOrigin + url : url;
  const parsed = new URL(target);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new PassportError("DEFINITION_SHAPE", `Unsupported tool URL ${url}.`);
  if (parsed.username || parsed.password) throw new PassportError("CREDENTIALS_IN_URL", "Tool URLs must not contain credentials.");
  return parsed.origin;
}

export function classifyTool(ref: JsonValue, config: JsonObject, peerOrigin: string, names = new Set((Array.isArray(config.tools) ? config.tools.filter(isObject) : []).map(a => a.name))): ToolRef {
  if (typeof ref !== "string") {
    if (!isObject(ref) || typeof ref.url !== "string" || !/^https?:\/\//.test(ref.url) || (ref.tools !== undefined && (!Array.isArray(ref.tools) || !ref.tools.every(t => typeof t === "string")))) {
      throw new PassportError("DEFINITION_SHAPE", "An MCP descriptor needs an HTTP(S) url and an optional string tools array.");
    }
    return { ref: ref.url, kind: "mcp", origin: contactOrigin(ref.url, peerOrigin), ...(ref.tools === undefined ? {} : { mcpTools: stringList(ref.tools) }) };
  }
  if (isMcpRef(ref)) return { ref, kind: "mcp", origin: contactOrigin(ref, peerOrigin) };
  if ((ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("/")) && !names.has(ref)) return { ref, kind: "remote", origin: remoteOrigin(ref) };
  if (names.has(ref)) return { ref, kind: "agent" };
  if (Object.hasOwn(spread(config.link_slots), ref)) {
    const target = object(config.links)[ref];
    return { ref, kind: "link", ...(typeof target === "string" && target ? { origin: contactOrigin(target, peerOrigin) } : {}) };
  }
  return { ref, kind: "missing" };
}

/** Validate before summarizing; retain independent failures for the card. */
export async function summarizeNetwork(config: JsonObject, manifest: JsonObject, entry: JsonObject, context: { siteBase: string; origin: string; name: string; checks: Check[] }): Promise<NetworkSummary> {
  const { checks } = context;
  const fail = (code: NonNullable<Check["code"]>, id: string, detail: string) => checks.push({ id, code, status: "fail", category: "verified", title: "Network structure refused", detail });
  if (!Array.isArray(config.tools) || !config.tools.length || !config.tools.every(isObject)) throw new PassportError("DEFINITION_SHAPE", "Definition needs a non-empty tools array of agent objects.");
  const agents = config.tools;
  const names = new Set<string>();
  const localNames = new Set(agents.map(a => a.name));
  const origins = new Set<string>();
  const coded = object(manifest.coded_tools);
  if (coded.bundle !== undefined && (typeof coded.bundle !== "string" || !coded.bundle)) throw new PassportError("MANIFEST_SHAPE", "coded_tools.bundle must be a non-empty string.");
  if (coded.integrity !== undefined && typeof coded.integrity !== "string") throw new PassportError("MANIFEST_SHAPE", "coded_tools.integrity must be a string.");
  let codedTools: NetworkSummary["codedTools"] = null;
  if (typeof coded.bundle === "string" && coded.bundle) {
    const url = requireHttpUrl(resolveUrl(context.siteBase, coded.bundle));
    origins.add(url.origin);
    codedTools = { bundle: url.href, integrity: typeof coded.integrity === "string" && coded.integrity ? coded.integrity : null };
    if (!codedTools.integrity) checks.push({ id: "definition.code-integrity", status: "warn", category: "verified", title: "Code bundle has no integrity digest", detail: `Publisher declares ${url.href} without an SRI digest; the bundle's content is not checked.` });
  }
  // runner.js runs at most min(max_steps, caller limit) model steps; a value below 1 means none at all.
  for (const [where, value] of [["network", config.max_steps], ...agents.map((a) => [`agent ${String(a.name)}`, a.max_steps] as const)] as const) {
    if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 1)) {
      throw new PassportError("DEFINITION_SHAPE", `max_steps for the ${where} is ${JSON.stringify(value)}; it must be a whole number of at least 1.`);
    }
  }
  if (config.cruse) {
    checks.push({ id: "runtime.cruse", status: "info", category: "runtime", title: "Runtime adds its own UI instructions", detail: "This network turns on CRUSE, so the runtime appends its own CRUSE rendering instructions to each agent's prompt and offers a render_cruse tool. Those additions come from the runtime, not from the partner, and are not part of the instructions shown here." });
  }
  const summaries: AgentSummary[] = [];
  for (const agent of agents) {
    if (typeof agent.name !== "string" || !agent.name.trim()) throw new PassportError("DEFINITION_SHAPE", "Every agent needs a non-empty string name.");
    const name = agent.name.trim();
    if (names.has(name)) fail("DUPLICATE_AGENT", `definition.duplicate.${name}`, `Duplicate agent name after trimming: ${JSON.stringify(name)}.`);
    names.add(name);
    if (agent.instructions !== undefined && typeof agent.instructions !== "string") throw new PassportError("DEFINITION_SHAPE", `Instructions for ${name} must be a string.`);
    if (agent.description !== undefined && typeof agent.description !== "string") throw new PassportError("DEFINITION_SHAPE", `Description for ${name} must be a string.`);
    if (agent.tools !== undefined && !Array.isArray(agent.tools)) throw new PassportError("DEFINITION_SHAPE", `Tools for ${name} must be an array.`);
    // Strict: any class key needs a declared bundle. But decide "REST toolbox" exactly as the
    // runtime's classify_tool does (truthy class first, then truthy toolbox), so a falsy class
    // such as null cannot hide a toolbox call the runtime will still make.
    let restUrl: string | undefined;
    const coded = Object.hasOwn(agent, "class");
    const rest = !agent.class && !!agent.toolbox;
    if (coded && !codedTools) fail("UNDECLARED_CODE", `definition.code.${name}`, `Agent ${name} declares executable code without coded_tools.bundle.`);
    if (rest) {
      // runner.js dispatchRest fetches args.url with no consent prompt and no allowed_peers check,
      // attaching sly_data.backend_token when the caller passed one. Only the partner's own origin,
      // which the visitor already approved, is acceptable.
      const args = object(agent.args);
      const target = (() => {
        try { return typeof args.url === "string" ? requireHttpUrl(args.url) : null; } catch { return null; }
      })();
      if (args.method !== undefined && typeof args.method !== "string") throw new PassportError("DEFINITION_SHAPE", `REST toolbox agent ${name} has a non-string method; the runtime would fail when calling it.`);
      // runner.js: (args.method || "GET").toUpperCase(); browsers refuse to send CONNECT, TRACE and TRACK.
      const method = (typeof args.method === "string" && args.method ? args.method : "GET").toUpperCase();
      if (["CONNECT", "TRACE", "TRACK"].includes(method)) throw new PassportError("DEFINITION_SHAPE", `REST toolbox agent ${name} uses ${method}, which a browser refuses to send; the runtime would fail on every call.`);
      if (target) restUrl = target.href;
      if (!target) fail("DEFINITION_SHAPE", `definition.rest.${name}`, `REST toolbox agent ${name} has no valid http(s) args.url.`);
      else {
        origins.add(target.origin);
        if (target.origin !== context.origin) {
          fail("UNCONSENTED_CONTACT", `definition.rest.${name}`, `REST toolbox agent ${name} would make your browser send ${method} ${target.href} without asking you: the runtime does not ask before toolbox calls, and that origin is not the partner's own. It would attach sly_data.backend_token if your site passed one.`);
        } else {
          checks.push({ id: `definition.rest.${name}`, status: "warn", category: "verified", title: "REST call to the partner's own site", detail: `Agent ${name} sends ${method} ${target.href} without a separate prompt, attaching sly_data.backend_token if your site passed one; the runtime also follows any redirect from that address.` });
        }
      }
    }
    const tools = (Array.isArray(agent.tools) ? agent.tools : []).map(ref => classifyTool(ref, config, context.origin, localNames));
    // runner.js names each tool with safeName(); two references with the same safe name overwrite each other.
    const toolNames = new Map<string, string>();
    if (config.cruse) toolNames.set("render_cruse", "the runtime's render_cruse tool");
    for (const tool of tools) {
      if (tool.kind === "missing") fail("MISSING_TOOL", `definition.tool.${name}.${tool.ref}`, `Agent ${name} references missing tool ${JSON.stringify(tool.ref)}.`);
      if (tool.origin) origins.add(tool.origin);
      if (tool.kind === "mcp" && tool.mcpTools) {
        checks.push({ id: `definition.mcp-restriction.${name}.${tool.ref}`, status: "warn", category: "verified", title: "MCP tool restriction not enforced", detail: `Agent ${name} declares only ${tool.mcpTools.join(", ") || "no"} tools from ${tool.ref}, but the reference runtime ignores that restriction and offers every tool the server lists.` });
      }
      if (tool.kind === "mcp") continue; // MCP tool names come from the server at run time.
      const safe = safeToolName(tool.kind === "remote" ? remoteAgentName(tool.ref) : tool.ref);
      const previous = toolNames.get(safe);
      if (previous) fail("TOOL_NAME_COLLISION", `definition.tool-name.${name}.${safe}`, `Agent ${name} has two tools the runtime would both call ${safe}: ${previous} and ${JSON.stringify(tool.ref)}. One would silently replace the other.`);
      else toolNames.set(safe, JSON.stringify(tool.ref));
    }
    const allow = object(agent.allow);
    const down = object(allow.to_downstream).sly_data;
    const up = object(allow.to_upstream).sly_data;
    for (const rules of [down, up]) if (rules !== undefined && rules !== null && (!Array.isArray(rules) || !rules.every(r => typeof r === "string"))) throw new PassportError("DEFINITION_SHAPE", `Private-context rules for ${name} must be string arrays.`);
    if (agent.command !== undefined && typeof agent.command !== "string") throw new PassportError("DEFINITION_SHAPE", `Command for ${name} must be a string.`);
    // Mirror runner.js: the system prompt is the trimmed instructions, then the trimmed command.
    const parts: string[] = [];
    if (typeof agent.instructions === "string" && agent.instructions) parts.push(agent.instructions.trim());
    if (typeof agent.command === "string" && agent.command) parts.push(agent.command.trim());
    const instructions = parts.join("\n\n");
    summaries.push({ name, description: typeof agent.description === "string" ? agent.description : "", instructions, instructionsSha256: await sha256Hex(instructions), tools, type: rest ? "rest" : agent.class ? "coded" : instructions ? "llm" : "other", ...(restUrl ? { restUrl } : {}), allowSly: { toDownstream: stringList(down), toUpstream: stringList(up) } });
  }
  const front = runtimeFrontMan(agents);
  if (front !== entry.front_man) fail("FRONT_MAN_MISMATCH", "definition.front-man", `Manifest front_man ${JSON.stringify(entry.front_man)} differs from runtime front agent ${JSON.stringify(front)}.`);
  const links: Record<string, string> = Object.create(null);
  if (config.links !== undefined && !isObject(config.links)) throw new PassportError("DEFINITION_SHAPE", "Network links must be an object.");
  for (const [slot, target] of Object.entries(object(config.links))) {
    if (typeof target !== "string") throw new PassportError("DEFINITION_SHAPE", `Link ${slot} must be a string URL.`);
    links[slot] = target;
    if (target) {
      // Engine.resolveLink accepts only an absolute http(s) URL for a link binding.
      if (!/^https?:\/\//i.test(target)) throw new PassportError("DEFINITION_SHAPE", `Link ${slot} is bound to ${JSON.stringify(target)}, which is not an absolute http(s) URL; the runtime would refuse it.`);
      origins.add(contactOrigin(target, context.origin));
    }
  }
  return {
    name: context.name, frontMan: typeof entry.front_man === "string" ? entry.front_man : "", runtimeFrontMan: front,
    agents: summaries, origins: [...origins].sort(), links, codedTools,
    declared: { brand: typeof manifest.brand === "string" ? manifest.brand : null, description: typeof entry.description === "string" ? entry.description : typeof manifest.description === "string" ? manifest.description : null, llmRouter: manifest.llm_router ?? null, peerPolicy: manifest.peer_policy ?? null, allowedPeers: stringList(manifest.allowed_peers), sampleQueries: stringList(entry.sample_queries ?? manifest.sample_queries) },
  };
}

/** runner.js safeName: the tool name a reference becomes in the model's tool list. */
export function safeToolName(s: string): string {
  return s.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+/, "").slice(0, 60) || "tool";
}

/** kernel.js parseExternalAgent(...).agentName for a remote reference: its path without the leading slash. */
function remoteAgentName(ref: string): string {
  if (ref.startsWith("/")) return ref.replace(/^\//, "");
  try { return new URL(ref).pathname.replace(/^\//, ""); } catch { return ref; }
}
