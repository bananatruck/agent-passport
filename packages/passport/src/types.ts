// Public types for Agent Passport. This file is the contract between the core
// (inspect, pins), the runtime guard and the card. See docs/SPEC.md section 5.

/** The four outcomes of a check. See docs/SPEC.md section 4.1 for exact meanings. */
export type Verdict = "verified" | "unreviewed" | "changed" | "refused";

/** Stable error and check codes. */
export type PassportCode =
  | "URL_INVALID"
  | "HTTPS_REQUIRED"
  | "CREDENTIALS_IN_URL"
  | "REDIRECT_REFUSED"
  | "HTTP_STATUS"
  | "CONTENT_TYPE"
  | "TOO_LARGE"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "NOT_UTF8"
  | "NOT_JSON"
  | "DUPLICATE_KEY"
  | "TOO_DEEP"
  | "TOO_MANY_KEYS"
  | "MANIFEST_SHAPE"
  | "NO_SUCH_NETWORK"
  | "DEFINITION_SHAPE"
  | "FRONT_MAN_MISMATCH"
  | "DUPLICATE_AGENT"
  | "MISSING_TOOL"
  | "UNDECLARED_CODE"
  | "HIDDEN_TEXT"
  | "DESTINATION_DECLINED"
  | "PIN_FILE_INVALID"
  | "UNCONSENTED_CONTACT"
  | "TOOL_NAME_COLLISION";

/** Byte, time and structure limits. All have defaults (see DEFAULT_LIMITS). */
export interface Limits {
  /** Max bytes of agent-manifest.json. Default 262144 (256 KiB). */
  manifestBytes: number;
  /** Max bytes of the network definition. Default 1048576 (1 MiB). */
  definitionBytes: number;
  /** Max bytes of links.json. Default 65536 (64 KiB). */
  linksBytes: number;
  /** Per-request timeout in milliseconds. Default 8000. */
  timeoutMs: number;
  /** Max JSON nesting depth. Default 64. */
  maxDepth: number;
  /** Max total object keys in one document. Default 20000. */
  maxKeys: number;
}

/** Where a check's claim comes from. Only "verified" is checked by Agent Passport itself. */
export type CheckCategory =
  | "verified" // Agent Passport checked this itself
  | "runtime" // enforced by the reference runtime, not by Agent Passport
  | "declared" // stated by the peer's publisher, not verified
  | "signal" // heuristic warning, not proof either way
  | "not-checked"; // explicitly out of scope

export type CheckStatus = "pass" | "fail" | "warn" | "info";

export interface Check {
  /** Stable id, for example "fetch.manifest.redirect" or "definition.front-man". */
  id: string;
  status: CheckStatus;
  category: CheckCategory;
  /** One short plain-language line. */
  title: string;
  /** One or two plain sentences with specifics (names, origins, sizes). */
  detail: string;
  /** Set for failures; one of PassportCode. */
  code?: PassportCode;
  /** The exact text behind the check, when there is one: decoded hidden text, or the quoted sentence for a signal. */
  evidence?: string;
}

/** One fetched file, after all checks on it passed. */
export interface Artifact {
  kind: "manifest" | "definition" | "links";
  url: string;
  origin: string;
  /** Byte length of the body as received. */
  bytes: number;
  /** Lowercase hex SHA-256 of the raw body bytes. */
  sha256: string;
  /** Raw body text (UTF-8 decoded, BOM removed). The guard serves exactly this to the runtime. */
  text: string;
  /** HTTP status of the response (200 for a found file; 404 allowed only for links.json). */
  status: number;
  contentType: string;
}

/** One reference in an agent's `tools` list, classified the way the runtime classifies it. */
export interface ToolRef {
  /** The reference as written: an agent name, a URL, a link slot name, or an MCP descriptor's URL. */
  ref: string;
  kind: "agent" | "remote" | "mcp" | "link" | "missing";
  /** For remote and mcp kinds: the origin that would be contacted. For link: the resolved origin when links.json binds it. */
  origin?: string;
  /** For MCP descriptors that restrict tool names. */
  mcpTools?: string[];
}

export interface AgentSummary {
  name: string;
  description: string;
  /** The system prompt the runtime builds: trimmed instructions, then trimmed command, after {token} substitution. "" when none. */
  instructions: string;
  /** Lowercase hex SHA-256 of `instructions` (UTF-8). */
  instructionsSha256: string;
  tools: ToolRef[];
  /** "llm" when it has instructions, "coded" when it has class (bundle code), "rest" when it has toolbox (a built-in REST call), "other" otherwise. */
  type: "llm" | "coded" | "rest" | "other";
  /** Private-context allow rules: allow.to_downstream.sly_data and allow.to_upstream.sly_data. */
  allowSly: { toDownstream: string[]; toUpstream: string[] };
}

export interface NetworkSummary {
  /** The requested and matched network name. */
  name: string;
  /** Manifest's declared front_man. */
  frontMan: string;
  /** The front agent the runtime will actually run (first agent with instructions and no class/toolbox). */
  runtimeFrontMan: string | null;
  agents: AgentSummary[];
  /** Every origin this network may contact (remote networks, MCP servers, linked networks, coded-tool bundle), sorted, deduplicated. */
  origins: string[];
  /** Link slot bindings from the peer's links.json for this network: slot -> URL. */
  links: Record<string, string>;
  codedTools: { bundle: string; integrity: string | null } | null;
  declared: {
    brand: string | null;
    description: string | null;
    llmRouter: unknown;
    peerPolicy: unknown;
    allowedPeers: string[];
    sampleQueries: string[];
  };
}

export interface Digests {
  /** sha256 of canonical JSON of { entry, coded_tools, brand, peer_policy, web_policy, allowed_peers, actions } from the manifest. */
  manifestEntry: string;
  /** sha256 of canonical JSON of the effective definition (after {token} substitution). */
  definition: string;
  /** sha256 of canonical JSON of this network's links.json entry ({} when absent). */
  links: string;
  /** sha256 of canonical JSON of { manifestEntry, definition, links }. */
  combined: string;
}

export type ChangeKind =
  | "front-man-changed"
  | "agent-added"
  | "agent-removed"
  | "instructions-changed"
  | "tools-changed"
  | "sly-changed"
  | "origin-added"
  | "origin-removed"
  | "links-changed"
  | "manifest-entry-changed"
  | "definition-changed";

export interface Change {
  kind: ChangeKind;
  agent?: string;
  /** Plain sentence describing the change. */
  detail: string;
  before?: string;
  after?: string;
}

export interface PinSnapshot {
  frontMan: string;
  agents: { name: string; instructionsSha256: string; tools: string[]; allowSly: { toDownstream: string[]; toUpstream: string[] } }[];
  origins: string[];
  links: Record<string, string>;
}

export interface PinEntry {
  /** Normalized network URL, for example "https://peer.example/agents/transit". */
  network: string;
  label: string;
  /** ISO 8601 date-time of the review. */
  reviewedAt: string;
  reviewedBy: string;
  note: string;
  digest: Digests;
  snapshot: PinSnapshot;
}

export interface PinFile {
  version: 1;
  pins: PinEntry[];
}

export interface PinResult {
  status: "match" | "mismatch" | "none";
  pin: PinEntry | null;
  changes: Change[];
}

export interface PassportReport {
  version: 1;
  /** The URL as given. */
  input: string;
  /** Normalized network URL, or null when the input is not a valid peer URL. */
  networkUrl: string | null;
  /** Site base the manifest was looked up under, for example "https://peer.example/agents". */
  siteBase: string | null;
  origin: string | null;
  networkName: string | null;
  verdict: Verdict;
  /** One plain sentence explaining the verdict. */
  summary: string;
  checks: Check[];
  artifacts: Partial<Record<"manifest" | "definition" | "links", Artifact>>;
  network: NetworkSummary | null;
  digest: Digests | null;
  pin: PinResult;
  /** ISO 8601 time the check finished. */
  checkedAt: string;
}

/** Called before contacting any origin other than the peer's own (for example a cross-origin definition). Return true to allow. */
export type ConfirmDestination = (request: { origin: string; url: string; purpose: string }) => Promise<boolean>;

export interface InspectOptions {
  fetch?: typeof fetch;
  pins?: PinFile | null;
  limits?: Partial<Limits>;
  /** Allow plain http for localhost, 127.0.0.0/8 and [::1]. Default true. */
  allowLoopbackHttp?: boolean;
  /** Default: refuse every extra origin. */
  confirmDestination?: ConfirmDestination;
  now?: () => Date;
}
