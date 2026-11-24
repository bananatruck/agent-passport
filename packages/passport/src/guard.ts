// Runtime guard: attaches Agent Passport to the reference nsdeploy browser runtime's
// Engine without editing the runtime. See docs/SPEC.md sections 4.2 and 5.
//
// Order of events for one partner call:
// 1. The runtime asks the visitor for consent to contact the partner's origin (its own UI).
// 2. The runtime calls engine.resolveRemote(ref, ...). The guard replaces that method:
//    it runs the runtime's own policy, cycle and cache checks first, then inspects the
//    partner with Agent Passport, then decides by verdict.
// 3. If the partner may load, the guard calls the original resolveRemote while a scoped
//    fetch interceptor answers the runtime's three requests (manifest, definition,
//    links.json) with exactly the bytes Agent Passport verified. Any other request to the
//    partner's origin during that window is refused. So the runtime compiles what was
//    checked, even if the partner's server changes its answer between the two moments.

import { inspectPeer } from "./inspect.js";
import type { InspectOptions, PassportReport, PinFile } from "./types.js";

/** The parts of the nsdeploy Engine the guard relies on (runtime commit in apps/site/public/runtime/UPSTREAM_COMMIT.txt). */
export interface NsdeployEngine {
  top: { base: string; manifest?: unknown } | null;
  registry: {
    get(origin: string, agentName: string): unknown;
    checkCycle(chain: string[], origin: string, agentName: string): void;
  };
  resolveRemote(ref: string, chain: string[], parentSpan: unknown, sourceManifest: unknown): Promise<unknown>;
  resolveMcp(ref: string | { url: string }, parentSpan: unknown, slyData: unknown, sourceManifest: unknown): Promise<unknown>;
  _mcpClients?: Map<string, unknown>;
  _assertAllowedPeer(target: string, sourceManifest: unknown): void;
}

export interface GuardContext {
  /** The reference exactly as the calling agent named it. */
  ref: string;
  /** Normalized network URL that was inspected. */
  networkUrl: string;
}

export interface GuardOptions {
  /** The caller site's pins, or a function that loads them (called once per check). */
  pins: PinFile | null | (() => Promise<PinFile | null>);
  /** The runtime's HOCON parser (runtime/index.js exports parseHocon). Enables the parser-differential check. */
  parseHocon?: (text: string) => unknown;
  /** Options passed to inspectPeer (limits, confirmDestination). `fetch` defaults to the fetch captured at install time. */
  inspect?: Omit<InspectOptions, "pins">;
  /** Called with every report, before the decision. Use it to show the passport card. */
  onReport?: (report: PassportReport, context: GuardContext) => void;
  /** Ask the visitor whether to load an unreviewed partner. Default: do not load. */
  approveUnreviewed?: (report: PassportReport, context: GuardContext) => Promise<boolean>;
  /** Ask the visitor whether to load a changed partner. Default: do not load (the publisher must review it again). */
  approveChanged?: (report: PassportReport, context: GuardContext) => Promise<boolean>;
  /** Called with the final decision for each check. */
  onDecision?: (report: PassportReport, loaded: boolean, context: GuardContext) => void;
  /**
   * Limits on responses from MCP servers that a loaded partner declared. The reference runtime
   * reads MCP responses without a deadline or size limit; the guard adds both from outside.
   * Defaults: 60 seconds and 5 MiB.
   */
  mcpLimits?: { timeoutMs?: number; bytes?: number };
}

export interface GuardHandle {
  /** Latest report per normalized network URL. */
  readonly reports: Map<string, PassportReport>;
  /** Restore the runtime's original resolveRemote and fetch. */
  uninstall(): void;
}

/** Error the guard throws to the runtime when a partner may not load; the runtime reports it to the calling agent. */
export class PassportBlockedError extends Error {
  readonly report: PassportReport;
  readonly code = "PASSPORT_BLOCKED";
  constructor(message: string, report: PassportReport) {
    super(message);
    this.name = "PassportBlockedError";
    this.report = report;
  }
}

interface ServedFile {
  status: number;
  body: string;
  contentType: string;
  /** Called when the runtime fetches this file. */
  onServe?: (url: string) => void;
}

/** Strict structural equality for JSON values (objects, arrays, strings, numbers, booleans, null). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => jsonEqual(item, b[i]));
  }
  if (typeof a === "object") {
    if (Array.isArray(b)) return false;
    const ak = Object.keys(a as object).sort();
    const bk = Object.keys(b as object).sort();
    if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) return false;
    return ak.every((k) => jsonEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

function requestUrl(input: RequestInfo | URL, base: string | undefined): string | null {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new URL(raw, base).href;
  } catch {
    return null;
  }
}

function pageBase(): string | undefined {
  return typeof location !== "undefined" ? location.href : undefined;
}

/**
 * Attach Agent Passport to an nsdeploy Engine. Call it once, right after boot().
 *
 * ```js
 * const { engine } = await boot("#agent-app", opts);
 * installPassportGuard(engine, { pins: () => loadPins(), parseHocon, onReport: showCard });
 * ```
 */
export function installPassportGuard(engine: NsdeployEngine, options: GuardOptions): GuardHandle {
  const originalFetch: typeof fetch = globalThis.fetch;
  const realFetch: typeof fetch = originalFetch.bind(globalThis);
  const originalResolveRemote = engine.resolveRemote;
  const originalResolveMcp = engine.resolveMcp;
  const reports = new Map<string, PassportReport>();
  // URL -> verified file, active only while the original resolveRemote runs for that partner.
  const served = new Map<string, ServedFile>();
  // Partner origins currently being compiled: any request to them that is not a served file is refused.
  const sealedOrigins = new Map<string, number>();
  // Guarded compiles run one at a time: two overlapping resolutions could otherwise replace or
  // delete each other's served files. Inspections still run in parallel.
  let compileQueue: Promise<void> = Promise.resolve();
  // Endpoints declared by partners the guard has loaded. The runtime calls them later without
  // further checks, so the guard tightens those calls from outside the runtime.
  const restTargets = new Set<string>();
  const mcpEndpoints = new Set<string>();
  const mcpTimeoutMs = options.mcpLimits?.timeoutMs ?? 60_000;
  const mcpBytes = options.mcpLimits?.bytes ?? 5 * 1024 * 1024;
  const mcpCredentialFingerprint = new Map<string, string>();

  function mcpTarget(ref: string | { url: string }): string {
    return typeof ref === "string" ? ref : ref.url;
  }

  function mcpHeaders(slyData: unknown, url: string): Record<string, string> {
    const root = slyData as { http_headers?: Record<string, Record<string, string>> } | null | undefined;
    return root?.http_headers?.[url] ?? {};
  }

  function mcpCredentialKey(headers: Record<string, string>): string {
    const keys = Object.keys(headers).sort();
    if (!keys.length) return "";
    return JSON.stringify(keys.map((k) => [k, headers[k] as string]));
  }

  const boundedMcpFetch = async (input: RequestInfo | URL, init: RequestInit | undefined, url: string): Promise<Response> => {
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new Error(`Agent Passport: the MCP server at ${url} did not finish within ${mcpTimeoutMs} ms.`)), mcpTimeoutMs);
    const signals = [deadline.signal, init?.signal, input instanceof Request ? input.signal : undefined].filter((s): s is AbortSignal => !!s);
    let response: Response;
    try {
      response = await realFetch(input as RequestInfo, { ...init, redirect: "error", signal: AbortSignal.any(signals) });
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
    if (!response.body) {
      clearTimeout(timer);
      return response;
    }
    let size = 0;
    const capped = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          size += chunk.byteLength;
          if (size > mcpBytes) {
            clearTimeout(timer);
            deadline.abort();
            controller.error(new Error(`Agent Passport: the MCP response from ${url} exceeded ${mcpBytes} bytes.`));
            return;
          }
          controller.enqueue(chunk);
        },
        flush() {
          clearTimeout(timer);
        },
      }),
    );
    return new Response(capped, { status: response.status, statusText: response.statusText, headers: response.headers });
  };

  const guardedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input, pageBase());
    if (url) {
      const file = served.get(url);
      if (file) {
        file.onServe?.(url);
        return new Response(file.status === 404 ? null : file.body, {
          status: file.status,
          headers: { "content-type": file.contentType },
        });
      }
      const withoutQuery = url.split(/[?#]/)[0]!;
      // One endpoint may serve both tools, so REST redirect refusal must retain MCP bounds.
      if (restTargets.has(url)) {
        const restInit: RequestInit = { ...init, redirect: "error" };
        return mcpEndpoints.has(withoutQuery) ? boundedMcpFetch(input, restInit, withoutQuery) : realFetch(input as RequestInfo, restInit);
      }
      if (mcpEndpoints.has(withoutQuery)) return boundedMcpFetch(input, init, withoutQuery);
      const origin = new URL(url).origin;
      if (sealedOrigins.has(origin)) {
        throw new TypeError(`Agent Passport: refused an unverified request to ${origin} while loading a checked partner.`);
      }
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
  globalThis.fetch = guardedFetch;

  const remember = (report: PassportReport) => {
    for (const agent of report.network?.agents ?? []) {
      if (agent.restUrl) restTargets.add(new URL(agent.restUrl).href);
      for (const tool of agent.tools) if (tool.kind === "mcp") mcpEndpoints.add(new URL(tool.ref).href.split(/[?#]/)[0]!);
    }
  };

  const loadPins = async (): Promise<PinFile | null> =>
    typeof options.pins === "function" ? await options.pins() : options.pins;

  function assertPublishedPeer(target: string, manifest: unknown): void {
    // Reuse the runtime's policy rules with an isolated receiver. Exceptions granted
    // by resolving links in other networks cannot expand a partner's published policy.
    const policyEngine = { ...engine, runtimeAllowedPeers: new Set<string>() };
    engine._assertAllowedPeer.call(policyEngine, target, manifest);
  }

  function assertCallerAllowedPeer(target: string, sourceManifest: unknown): void {
    if (!sourceManifest || sourceManifest === engine.top?.manifest) {
      engine._assertAllowedPeer(target, sourceManifest);
    } else {
      assertPublishedPeer(target, sourceManifest);
    }
  }

  async function guardedResolveRemote(
    this: NsdeployEngine,
    ref: string,
    chain: string[],
    parentSpan: unknown,
    sourceManifest: unknown,
  ): Promise<unknown> {
    if (!engine.top) throw new Error("Agent Passport: the runtime has not loaded its own network yet.");
    // Mirror engine.resolveRemote's first steps, so policy and cycle limits still come first
    // and nothing is fetched for a partner the caller's policy does not allow.
    const target = new URL(ref, `${engine.top.base}/`);
    const origin = new URL("./", target).href.replace(/\/$/, "");
    assertCallerAllowedPeer(origin, sourceManifest);
    const lastSeg = target.pathname.split("/").filter(Boolean).pop() ?? "";
    engine.registry.checkCycle(chain, origin, lastSeg);
    const cached = engine.registry.get(origin, lastSeg);
    if (cached) return cached;

    const context: GuardContext = { ref, networkUrl: target.href };
    const report = await inspectPeer(target.href, {
      fetch: realFetch,
      ...options.inspect,
      pins: await loadPins(),
    });
    reports.set(report.networkUrl ?? target.href, report);
    options.onReport?.(report, context);

    const block = (why: string): never => {
      options.onDecision?.(report, false, context);
      throw new PassportBlockedError(`Agent Passport did not load ${lastSeg}: ${why} Its agents did not run.`, report);
    };

    if (report.siteBase !== origin || report.networkName !== lastSeg) {
      block("the inspected network does not match the one the runtime asked for.");
    }
    if (report.verdict === "refused") block(report.summary);
    if (report.verdict === "changed") {
      const ok = options.approveChanged ? await options.approveChanged(report, context) : false;
      if (!ok) block(report.summary);
    }
    if (report.verdict === "unreviewed") {
      const ok = options.approveUnreviewed ? await options.approveUnreviewed(report, context) : false;
      if (!ok) block("it has not been reviewed by this site's publisher, and the visitor did not approve loading it.");
    }

    const { manifest, definition, links } = report.artifacts;
    if (!manifest || !definition) block("the verified files are missing from the report.");
    // resolveLink grants published targets a runtime policy exception. Check the checked
    // bindings before they can reach that path and expand the partner's allowed peers.
    const partnerManifest: unknown = JSON.parse(manifest!.text);
    for (const target of Object.values(report.network?.links ?? {})) {
      if (!target) continue;
      try { assertPublishedPeer(target, partnerManifest); }
      catch { block("a published link targets a destination outside its allowed_peers policy."); }
    }
    if (options.parseHocon) {
      const parse = options.parseHocon;
      const same = (() => {
        try {
          return jsonEqual(parse(definition!.text), JSON.parse(definition!.text));
        } catch {
          return false;
        }
      })();
      if (!same) block("the runtime's HOCON parser reads the definition differently from a JSON parser.");
    }

    // Serve exactly the verified bytes at the URLs the runtime will request.
    const files: [string, ServedFile][] = [
      [new URL(`${origin}/agent-manifest.json`).href, { status: 200, body: manifest!.text, contentType: "application/json" }],
      [new URL(definition!.url).href, { status: 200, body: definition!.text, contentType: "application/json" }],
      [
        new URL(`${origin}/links.json`).href,
        links && links.status >= 200 && links.status < 300
          ? { status: 200, body: links.text, contentType: "application/json" }
          : { status: 404, body: "", contentType: "text/plain" },
      ],
    ];
    // Each checked file needs its own address; two at one URL would let one replace the other.
    if (new Set(files.map(([url]) => url)).size !== files.length) {
      block("two of its checked files share one address.");
    }
    const peerOrigin = new URL(origin).origin;
    const previous = compileQueue;
    let releaseQueue!: () => void;
    compileQueue = new Promise<void>((resolve) => (releaseQueue = resolve));
    await previous;
    try {
      // Another resolution of the same partner may have compiled it while this one waited.
      const compiled = engine.registry.get(origin, lastSeg);
      if (compiled) {
        remember(report);
        options.onDecision?.(report, true, context);
        return compiled;
      }
      // Release the queue as soon as the runtime has read every checked file. After that the runtime
      // may wait on the visitor (for example for a partner's action bridge), and that wait must not
      // hold up other partners. resolveRemote settling also releases it.
      const remaining = new Set(files.map(([url]) => url));
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        for (const [url] of files) served.delete(url);
        const left = (sealedOrigins.get(peerOrigin) ?? 1) - 1;
        if (left <= 0) sealedOrigins.delete(peerOrigin);
        else sealedOrigins.set(peerOrigin, left);
        releaseQueue();
      };
      const onServe = (url: string) => {
        remaining.delete(url);
        if (remaining.size === 0) release();
      };
      for (const [url, file] of files) served.set(url, { ...file, onServe });
      sealedOrigins.set(peerOrigin, (sealedOrigins.get(peerOrigin) ?? 0) + 1);
      try {
        const session = await originalResolveRemote.call(engine, ref, chain, parentSpan, sourceManifest);
        remember(report);
        options.onDecision?.(report, true, context);
        return session;
      } finally {
        release();
      }
    } finally {
      releaseQueue();
    }
  }

  async function guardedResolveMcp(
    this: NsdeployEngine,
    ref: string | { url: string },
    parentSpan: unknown,
    slyData: unknown,
    sourceManifest: unknown,
  ): Promise<unknown> {
    const url = mcpTarget(ref);
    assertCallerAllowedPeer(url, sourceManifest);
    const headers = mcpHeaders(slyData, url);
    if (Object.keys(headers).length && new URL(url).protocol === "http:") {
      throw new TypeError(`Agent Passport: refuse to send MCP credentials over HTTP; use HTTPS for ${url}.`);
    }
    const credKey = mcpCredentialKey(headers);
    const previous = mcpCredentialFingerprint.get(url);
    if (previous !== credKey) engine._mcpClients?.delete(url);
    mcpCredentialFingerprint.set(url, credKey);
    return originalResolveMcp.call(engine, ref, parentSpan, slyData, sourceManifest);
  }

  engine.resolveRemote = guardedResolveRemote;
  engine.resolveMcp = guardedResolveMcp;

  return {
    reports,
    uninstall() {
      engine.resolveRemote = originalResolveRemote;
      engine.resolveMcp = originalResolveMcp;
      if (globalThis.fetch === guardedFetch) globalThis.fetch = originalFetch;
    },
  };
}
