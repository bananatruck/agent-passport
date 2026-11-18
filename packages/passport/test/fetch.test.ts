import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS } from "../src/limits.js";
import { fetchArtifact } from "../src/fetch.js";
import { sha256Hex } from "../src/canonical.js";
import type { Check } from "../src/types.js";
import { fakeFetch } from "./fake-fetch.js";

const url = "https://peer.example/file.json";
function context(route: () => Response | Promise<Response>, limits = {}) {
  const checks: Check[] = [];
  const calls: { url: string; init?: RequestInit }[] = [];
  return { fetch: fakeFetch({ [url]: route }, calls), limits: { ...DEFAULT_LIMITS, ...limits }, checks, calls };
}
const code = (code: string) => expect.objectContaining({ code });

describe("artifact fetching", () => {
  it("sends the specified privacy and redirect options", async () => {
    const ctx = context(() => new Response('{}', { headers: { "content-type": "application/json" } }));
    const artifact = await fetchArtifact(url, "manifest", ctx);
    expect(ctx.calls[0]?.init).toMatchObject({ method: "GET", credentials: "omit", redirect: "manual", referrerPolicy: "no-referrer", cache: "no-store", mode: "cors", signal: expect.any(AbortSignal) });
    expect(artifact).toMatchObject({ url, origin: "https://peer.example", bytes: 2, sha256: await sha256Hex("{}"), text: "{}", status: 200 });
  });
  it.each(["application/json", "application/problem+json; charset=UTF-8", "text/json", "text/plain", "APPLICATION/JSON"])("allows %s", async type => {
    await expect(fetchArtifact(url, "manifest", context(() => new Response("{}", { headers: { "content-type": type } })))).resolves.toHaveProperty("text", "{}");
  });
  it("allows a missing Content-Type with an info check", async () => {
    const ctx = context(() => new Response(new TextEncoder().encode("{}")));
    await fetchArtifact(url, "manifest", ctx);
    expect(ctx.checks).toContainEqual(expect.objectContaining({ status: "info", id: "fetch.manifest.content-type" }));
  });
  it.each(["text/html", "application/octet-stream", "image/png"])("refuses %s", async type => {
    await expect(fetchArtifact(url, "manifest", context(() => new Response("{}", { headers: { "content-type": type } })))).rejects.toThrow(code("CONTENT_TYPE"));
  });
  it.each([301, 302, 303, 307, 308])("refuses redirect status %d", async status => {
    await expect(fetchArtifact(url, "manifest", context(() => new Response(null, { status, headers: { Location: "https://evil.example/x" } })))).rejects.toThrow(expect.objectContaining({ code: "REDIRECT_REFUSED", message: expect.stringContaining("Location origin https://evil.example; cross-origin: true") }));
  });
  it("reports a same-origin redirect", async () => {
    await expect(fetchArtifact(url, "manifest", context(() => new Response(null, { status: 302, headers: { Location: "/x" } })))).rejects.toThrow(expect.objectContaining({ message: expect.stringContaining("cross-origin: false") }));
  });
  it.each([{ redirected: true }, { url: "https://evil.example/file.json" }, { type: "opaqueredirect" }])("refuses redirect evidence %j", async properties => {
    const response = new Response("{}");
    for (const [key, value] of Object.entries(properties)) Object.defineProperty(response, key, { value });
    await expect(fetchArtifact(url, "manifest", context(() => response))).rejects.toThrow(code("REDIRECT_REFUSED"));
  });
  it.each([201, 204, 400, 404, 500])("refuses non-200 status %d", async status => {
    await expect(fetchArtifact(url, "definition", context(() => new Response(null, { status })))).rejects.toThrow(code("HTTP_STATUS"));
  });
  it("allows 404 only for links", async () => {
    await expect(fetchArtifact(url, "links", context(() => new Response(null, { status: 404 })))).resolves.toMatchObject({ status: 404, bytes: 0, text: "" });
  });
  it("refuses Content-Length overflow before reading", async () => {
    let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    const ctx = context(() => new Response(body, { headers: { "Content-Length": "9999", "Content-Type": "application/json" } }), { manifestBytes: 2 });
    await expect(fetchArtifact(url, "manifest", ctx)).rejects.toThrow(code("TOO_LARGE"));
    expect(ctx.calls[0]?.init?.signal?.aborted).toBe(true);
    expect(cancelled).toBe(true);
  });
  it("counts streamed bytes, cancels endless overflow, and ignores a lying length", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(3)); }, cancel() { cancelled = true; } });
    const ctx = context(() => new Response(stream, { headers: { "Content-Length": "1", "Content-Type": "application/json" } }), { definitionBytes: 4 });
    await expect(fetchArtifact(url, "definition", ctx)).rejects.toThrow(code("TOO_LARGE"));
    expect(cancelled).toBe(true);
  });
  it("times out waiting for headers, even when the fetch ignores abort", async () => {
    const ctx = context(() => new Promise<Response>(() => {}), { timeoutMs: 10 });
    await expect(fetchArtifact(url, "manifest", ctx)).rejects.toThrow(code("TIMEOUT"));
    expect(ctx.calls[0]?.init?.signal?.aborted).toBe(true);
  });
  it("times out and cancels a stalled body", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode("{")); }, cancel() { cancelled = true; } });
    await expect(fetchArtifact(url, "manifest", context(() => new Response(stream, { headers: { "Content-Type": "application/json" } }), { timeoutMs: 10 }))).rejects.toThrow(code("TIMEOUT"));
    expect(cancelled).toBe(true);
  });
  it("refuses malformed UTF-8", async () => {
    await expect(fetchArtifact(url, "manifest", context(() => new Response(new Uint8Array([0xC3, 0x28]))))).rejects.toThrow(code("NOT_UTF8"));
  });
  it("strips one BOM and hashes the raw bytes", async () => {
    const bytes = new TextEncoder().encode("\uFEFF\uFEFF{}");
    const artifact = await fetchArtifact(url, "manifest", context(() => new Response(bytes)));
    expect(artifact.text).toBe("\uFEFF{}");
    expect(artifact.sha256).toBe(await sha256Hex(bytes));
    expect(artifact.bytes).toBe(bytes.byteLength);
  });
  it("turns transport failures into stable errors", async () => {
    await expect(fetchArtifact(url, "manifest", context(() => { throw new TypeError("offline"); }))).rejects.toThrow(code("NETWORK_ERROR"));
  });
});
