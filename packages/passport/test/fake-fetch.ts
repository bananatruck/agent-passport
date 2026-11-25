export type Route = string | object | (() => Response | Promise<Response>);
export function fakeFetch(routes: Record<string, Route>, calls: { url: string; init?: RequestInit }[] = []): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes[url];
    if (typeof route === "function") return route();
    if (route === undefined) return new Response(null, { status: 404 });
    return new Response(typeof route === "string" ? route : JSON.stringify(route), { headers: { "Content-Type": "application/json" } });
  };
}
