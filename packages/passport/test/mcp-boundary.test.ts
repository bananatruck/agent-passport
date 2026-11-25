import { afterEach, expect, it } from "vitest";
import { Engine } from "../../../apps/site/public/runtime/engine.js";
import { installPassportGuard, type GuardOptions, type GuardHandle } from "../src/guard.js";

const endpoint = "https://mcp.example/mcp";
const policy = { peer_policy: { mode: "open" } };
const originalFetch = globalThis.fetch;
let guard: GuardHandle | undefined;
afterEach(() => { guard?.uninstall(); guard = undefined; globalThis.fetch = originalFetch; });

const toolCalls: unknown[] = [];
async function clientFor(answer: (id: number) => Response, options: Partial<GuardOptions> = {}) {
  toolCalls.length = 0;
  globalThis.fetch = async (_input, init) => {
    const rpc = JSON.parse(String(init?.body));
    if (rpc.method === "tools/call") toolCalls.push(rpc.params);
    return rpc.method === "tools/list" ? answer(rpc.id) : Response.json({ jsonrpc: "2.0", id: rpc.id, result: {} });
  };
  const engine = new Engine({ originUrl: "https://caller.example" });
  guard = installPassportGuard(engine, { pins: null, mcpLimits: { timeoutMs: 100 }, ...options });
  return engine.resolveMcp(endpoint, null, {}, policy);
}

it.each(["split CRLF", "lone CR"])("reads MCP SSE with %s before the connection closes", async kind => {
  let close!: () => void;
  const client = await clientFor(id => {
    const payload = `data: ${JSON.stringify({ jsonrpc: "2.0", id, result: { tools: [{ name: "search" }] } })}`;
    const chunks = kind === "split CRLF" ? [payload + "\r", "\n\r", "\n"] : [payload + "\r\r"];
    return new Response(new ReadableStream({ start(controller) { for (const c of chunks) controller.enqueue(new TextEncoder().encode(c)); close = () => { try { controller.close(); } catch { /* already cancelled */ } }; } }), { headers: { "Content-Type": "text/event-stream" } });
  });
  const pending = client.listTools();
  const result = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve("stalled"), 50))]);
  close();
  await pending.catch(() => {});
  expect(result).toEqual([{ name: "search" }]);
});

it.each(["JSON", "SSE", "JSON string ID"])("rejects an MCP %s response for a different request", async kind => {
  const client = await clientFor(id => {
    const rpc = { jsonrpc: "2.0", id: kind === "JSON string ID" ? String(id) : id - 1, result: { tools: [{ name: "wrong" }] } };
    return kind === "SSE" ? new Response(`data: ${JSON.stringify(rpc)}\n\n`, { headers: { "Content-Type": "text/event-stream" } }) : Response.json(rpc);
  });
  await expect(client.listTools()).rejects.toThrow();
});

it("keeps SSE notifications and returns the matching response after an unrelated one", async () => {
  const client = await clientFor(id => new Response([
    { jsonrpc: "2.0", id: id - 1, result: { tools: [{ name: "wrong" }] } },
    { jsonrpc: "2.0", method: "notifications/message", params: { message: "working" } },
    { jsonrpc: "2.0", id, result: { tools: [{ name: "right" }] } },
  ].map(rpc => `data: ${JSON.stringify(rpc)}\r\n\r\n`).join(""), { headers: { "Content-Type": "text/event-stream" } }));
  const notices: unknown[] = [];
  client.onProgress = (notice: unknown) => { notices.push(notice); };
  expect(await client.listTools()).toEqual([{ name: "right" }]);
  expect(notices).toHaveLength(1);
});

it("requires approval of the complete structured MCP payload, including fields beyond request", async () => {
  const previews: unknown[] = [];
  const args = { request: "Help", customer: "test-customer", details: { message: "x".repeat(200) } };
  const client = await clientFor(id => Response.json({ id, result: {} }), { approveMcpCall: async (preview: unknown) => { previews.push(preview); return true; } });
  await client.callTool("send", args);
  expect(previews).toEqual([{ url: endpoint, tool: "send", arguments: args }]);
  expect(toolCalls).toEqual([{ name: "send", arguments: args }]);
});

it("sends no MCP tool payload without complete-payload approval", async () => {
  const client = await clientFor(id => Response.json({ id, result: {} }));
  await expect(client.callTool("send", { request: "Help", customer: "test-customer" })).rejects.toThrow(/approv/i);
  expect(toolCalls).toEqual([]);
});

it("sends the approved snapshot even if the caller changes arguments while approval waits", async () => {
  const args = { request: "Help", customer: "first" };
  let decide!: (ok: boolean) => void;
  let ready!: () => void;
  const waiting = new Promise<void>(resolve => { ready = resolve; });
  const client = await clientFor(id => Response.json({ id, result: {} }), { approveMcpCall: async () => { ready(); return new Promise(resolve => { decide = resolve; }); } });
  const pending = client.callTool("send", args);
  await waiting;
  args.customer = "changed";
  decide(true);
  await pending;
  expect(toolCalls).toEqual([{ name: "send", arguments: { request: "Help", customer: "first" } }]);
});
