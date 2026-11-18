import type { InspectOptions } from "../src/types.js";
import { inspectPeer } from "../src/inspect.js";

export const peer = "https://peer.example/agents/transit";
export const manifest = () => ({ brand: "Transit", networks: [{ name: "transit", front_man: "desk", hocon: "/transit.json" }] });
export const definition = (): { tools: { name: string; instructions: string; tools: unknown[] }[] } => ({ tools: [{ name: "desk", instructions: "Help the visitor.", tools: [] }] });
import { fakeFetch } from "./fake-fetch.js";
import type { Route } from "./fake-fetch.js";
export { fakeFetch } from "./fake-fetch.js";
export type { Route } from "./fake-fetch.js";
export function routes(m: unknown = manifest(), d: unknown = definition(), links?: unknown): Record<string, Route> {
  return {
    "https://peer.example/agents/agent-manifest.json": JSON.stringify(m),
    "https://peer.example/agents/transit.json": JSON.stringify(d),
    ...(links === undefined ? {} : { "https://peer.example/agents/links.json": JSON.stringify(links) }),
  };
}
export function inspect(m: unknown = manifest(), d: unknown = definition(), links?: unknown, options: InspectOptions = {}) {
  return inspectPeer(peer, { fetch: fakeFetch(routes(m, d, links)), ...options });
}
