import { PassportError } from "./errors.js";

/** The runtime concatenates paths, including paths beginning with a slash. */
export function resolveUrl(base: string, path: string): string {
  return new URL(/^https?:\/\//i.test(path) ? path : base.replace(/\/$/, "") + (path.startsWith("/") ? path : "/" + path)).href;
}

export function requireHttpUrl(input: string, allowLoopbackHttp = true): URL {
  let url: URL;
  try { url = new URL(input); }
  catch { throw new PassportError("URL_INVALID", `Invalid URL: ${input}`); }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new PassportError("URL_INVALID", "Only HTTP and HTTPS URLs are supported.");
  }
  if (url.username || url.password) throw new PassportError("CREDENTIALS_IN_URL", "URLs must not contain credentials.");
  const loopback = url.hostname === "localhost" || url.hostname === "[::1]" || /^127\.\d+\.\d+\.\d+$/.test(url.hostname);
  if (url.protocol === "http:" && !(allowLoopbackHttp && loopback)) {
    throw new PassportError("HTTPS_REQUIRED", `HTTPS is required for ${url.hostname}.`);
  }
  return url;
}

export function parsePeerUrl(input: string, { allowLoopbackHttp = true }: { allowLoopbackHttp?: boolean } = {}) {
  const url = requireHttpUrl(input, allowLoopbackHttp);
  // URL.search/hash omit empty '?' and '#', which must also be refused.
  if (input.includes("?") || input.includes("#") || !url.pathname || url.pathname.endsWith("/")) {
    throw new PassportError("URL_INVALID", "A peer URL needs a final network name and no query or fragment.");
  }
  const networkName = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
  const siteBase = new URL("./", url).href.replace(/\/$/, "");
  return { networkUrl: url.href, siteBase, origin: url.origin, networkName };
}
