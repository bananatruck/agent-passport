import { sha256Hex } from "./canonical.js";
import { PassportError } from "./errors.js";
import type { Artifact, Check, Limits } from "./types.js";

export interface FetchContext {
  fetch: typeof fetch;
  limits: Limits;
  checks: Check[];
}

export async function fetchArtifact(url: string, kind: Artifact["kind"], ctx: FetchContext): Promise<Artifact> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { controller.abort(); void reader?.cancel().catch(() => {}); };
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new PassportError("TIMEOUT", `${kind} exceeded ${ctx.limits.timeoutMs} ms at ${url}.`));
      cancel();
    }, ctx.limits.timeoutMs);
  });
  const read = async (): Promise<Artifact> => {
    const response = await ctx.fetch(url, {
      method: "GET", credentials: "omit", redirect: "manual", referrerPolicy: "no-referrer",
      cache: "no-store", mode: "cors", signal: controller.signal,
    });
    const requestedOrigin = new URL(url).origin;
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400) || response.redirected || (response.url && new URL(response.url).origin !== requestedOrigin)) {
      let detail = `Redirect refused for ${kind} at ${url}.`;
      const location = response.headers.get("location");
      if (location) {
        try {
          const target = new URL(location, url);
          detail += ` Location origin ${target.origin}; cross-origin: ${target.origin !== requestedOrigin}.`;
        } catch { detail += " Location is not a valid URL."; }
      }
      throw new PassportError("REDIRECT_REFUSED", detail);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (response.status === 404 && kind === "links") {
      void response.body?.cancel().catch(() => {});
      return { kind, url, origin: requestedOrigin, bytes: 0, sha256: await sha256Hex(new Uint8Array()), text: "", status: 404, contentType };
    }
    if (response.status !== 200) throw new PassportError("HTTP_STATUS", `${kind} returned HTTP ${response.status} at ${url}.`);
    reader = response.body?.getReader();
    const media = contentType.split(";", 1)[0]?.trim().toLowerCase();
    if (media && !/^(?:application\/json|[^/\s]+\/[^/\s]+\+json|text\/json|text\/plain)$/.test(media)) {
      throw new PassportError("CONTENT_TYPE", `${kind} has unsupported Content-Type ${contentType}.`);
    }
    if (!media) ctx.checks.push({ id: `fetch.${kind}.content-type`, status: "info", category: "verified", title: "Content-Type missing", detail: `${kind} has no Content-Type; UTF-8 and strict JSON are still checked.` });
    const limit = ctx.limits[`${kind}Bytes`];
    const declared = response.headers.get("content-length");
    if (declared !== null && Number(declared) > limit) throw new PassportError("TOO_LARGE", `${kind} Content-Length exceeds ${limit} bytes.`);
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit) throw new PassportError("TOO_LARGE", `${kind} body exceeds ${limit} bytes.`);
        chunks.push(chunk.value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let text: string;
    try {
      // Preserve BOM during decode, then remove exactly one leading BOM.
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes).replace(/^\uFEFF/, "");
    } catch { throw new PassportError("NOT_UTF8", `${kind} is not valid UTF-8.`); }
    return { kind, url, origin: requestedOrigin, bytes: size, sha256: await sha256Hex(bytes), text, status: 200, contentType };
  };
  try { return await Promise.race([read(), timeout]); }
  catch (error) {
    cancel();
    if (error instanceof PassportError) throw error;
    throw new PassportError("NETWORK_ERROR", `${kind} fetch failed at ${url}: ${error instanceof Error ? error.message : String(error)}`);
  } finally { clearTimeout(timer); }
}
