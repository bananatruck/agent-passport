#!/usr/bin/env node
// Serves the whole demo offline: the Trip Desk site and each partner on its own loopback
// port (so every partner is a real cross-origin peer), plus hazard fixtures that need a
// server. Run after `pnpm build`:  node scripts/serve.mjs
//
// The committed site files name the GitHub Pages partner URLs (raw.githubusercontent.com).
// This server rewrites those URLs to the local partner ports in the files it serves; the
// files on disk are not changed.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = process.env.HOST || "127.0.0.1";
const SITE_PORT = Number(process.env.SITE_PORT || 4173);
const PROD_PEERS = "https://raw.githubusercontent.com/bananatruck/agent-passport/main/peers";

export const PARTNERS = [
  { id: "harbor_ferry", port: Number(process.env.FERRY_PORT || 4174) },
  { id: "tidewhistle_rooms", port: Number(process.env.ROOMS_PORT || 4175) },
  { id: "gull_deals", port: Number(process.env.DEALS_PORT || 4176) },
];
const HAZARD_PORT = Number(process.env.HAZARD_PORT || 4177);

const local = (port) => `http://${HOST}:${port}`;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
  ".woff2": "font/woff2",
};

/** Rewrite production partner URLs to local ones in a served text file. */
function localize(text) {
  let out = text;
  for (const p of PARTNERS) {
    out = out.split(`${PROD_PEERS}/${p.id}`).join(local(p.port));
  }
  return out;
}

function localizeManifest(text) {
  const manifest = JSON.parse(localize(text));
  manifest.allowed_peers = [...PARTNERS.map((p) => local(p.port)), local(HAZARD_PORT)];
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const HAZARDS = [
  { id: "redirect_away", label: "Redirects to another origin", expected: "refused" },
  { id: "endless_brochure", label: "Sends a manifest that never ends", expected: "refused" },
  { id: "slow_dock", label: "Answers after 20 seconds", expected: "refused" },
  { id: "html_lobby", label: "Serves a web page instead of JSON", expected: "refused" },
];

function localizeDemoPeers(text) {
  const doc = JSON.parse(localize(text));
  doc.hazards = HAZARDS.map((h) => ({ ...h, url: `${local(HAZARD_PORT)}/${h.id}/${h.id}` }));
  doc.environment = "local";
  return `${JSON.stringify(doc, null, 2)}\n`;
}

const REWRITES = {
  "/agent-manifest.json": localizeManifest,
  "/trip_desk.network.json": localize,
  "/passports.json": localize,
  "/demo-peers.json": localizeDemoPeers,
};

async function sendFile(res, file, { cors, rewrite }) {
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not a file");
    const type = TYPES[extname(file)] || "application/octet-stream";
    let body = await readFile(file);
    if (rewrite) body = Buffer.from(rewrite(body.toString("utf8")));
    res.writeHead(200, { "content-type": type, ...(cors ? { "access-control-allow-origin": "*" } : {}), "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain", ...(cors ? { "access-control-allow-origin": "*" } : {}) });
    res.end("Not found");
  }
}

function safeJoin(base, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const full = normalize(join(base, decoded));
  if (full !== base && !full.startsWith(base + sep)) return null;
  return full;
}

function staticServer(base, { cors, rewrites = {}, spa = false }) {
  return createServer(async (req, res) => {
    const path = (req.url || "/").split("?")[0];
    let file = safeJoin(base, path === "/" ? "/index.html" : path);
    if (!file) {
      res.writeHead(400).end();
      return;
    }
    if (spa && !extname(file)) file = join(base, "index.html");
    await sendFile(res, file, { cors, rewrite: rewrites[path] });
  });
}

function hazardServer() {
  return createServer((req, res) => {
    const cors = { "access-control-allow-origin": "*" };
    const path = (req.url || "/").split("?")[0];
    const [, id, file] = path.split("/");
    if (file !== "agent-manifest.json") {
      res.writeHead(404, cors).end("Not found");
      return;
    }
    if (id === "redirect_away") {
      res.writeHead(302, { ...cors, location: `${local(PARTNERS[0].port)}/agent-manifest.json` }).end();
    } else if (id === "endless_brochure") {
      res.writeHead(200, { ...cors, "content-type": "application/json" });
      res.write('{"networks":[{"name":"endless_brochure","description":"');
      const chunk = "a".repeat(64 * 1024);
      const timer = setInterval(() => {
        if (!res.write(chunk)) return;
      }, 5);
      req.on("close", () => clearInterval(timer));
    } else if (id === "slow_dock") {
      const timer = setTimeout(() => {
        res.writeHead(200, { ...cors, "content-type": "application/json" }).end("{}");
      }, 20000);
      req.on("close", () => clearTimeout(timer));
    } else if (id === "html_lobby") {
      res.writeHead(200, { ...cors, "content-type": "text/html; charset=utf-8" }).end("<!doctype html><title>Welcome</title><p>Welcome to the lobby.</p>");
    } else {
      res.writeHead(404, cors).end("Not found");
    }
  });
}

function listen(server, port, label) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, () => {
      console.log(`${label.padEnd(22)} ${local(port)}`);
      resolve(server);
    });
  });
}

export async function startAll() {
  const servers = [];
  servers.push(await listen(staticServer(join(root, "apps/site/dist"), { cors: true, rewrites: REWRITES, spa: true }), SITE_PORT, "Tidewater Trip Desk"));
  for (const p of PARTNERS) {
    servers.push(await listen(staticServer(join(root, "peers", p.id), { cors: true }), p.port, `Partner ${p.id}`));
  }
  servers.push(await listen(hazardServer(), HAZARD_PORT, "Hazard fixtures"));
  return servers;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const servers = await startAll();
  console.log(`\nOpen ${local(SITE_PORT)}/ in a browser. Press Ctrl+C to stop.`);
  const stop = () => {
    for (const s of servers) s.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
