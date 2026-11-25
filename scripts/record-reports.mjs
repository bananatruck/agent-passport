#!/usr/bin/env node
// Records real Agent Passport reports for the three demo partners into
// apps/site/src/recorded-reports.json. The page shows them where it needs a passport
// before the visitor has run anything (the hero), labelled as recorded checks.
//
//   node scripts/record-reports.mjs            # partners served locally by scripts/serve.mjs
//   node scripts/record-reports.mjs --pages    # partners on raw.githubusercontent.com (after deploy)
//
// Requires a built library (pnpm --filter agent-passport build).
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectPeer, parsePinFile } from "../packages/passport/dist/index.js";
import { PARTNERS } from "./serve.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_PEERS = "https://raw.githubusercontent.com/bananatruck/agent-passport/main/peers";
const pages = process.argv.includes("--pages");

let pinText = await readFile(join(root, "apps/site/public/passports.json"), "utf8");
const servers = [];
const urls = {};
if (pages) {
  for (const p of PARTNERS) urls[p.id] = `${PROD_PEERS}/${p.id}/${p.id}`;
} else {
  const { createServer } = await import("node:http");
  for (const p of PARTNERS) {
    const server = createServer(async (req, res) => {
      const name = (req.url || "/").split("?")[0].replace(/^\/+/, "");
      try {
        if (!/^[\w.-]+\.json$/.test(name)) throw new Error("not found");
        const body = await readFile(join(root, "peers", p.id, name));
        res.writeHead(200, { "content-type": "application/json" }).end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const local = `http://127.0.0.1:${server.address().port}`;
    urls[p.id] = `${local}/${p.id}`;
    pinText = pinText.split(`${PROD_PEERS}/${p.id}`).join(local);
  }
}

const pins = parsePinFile(pinText);
const out = { source: pages ? "pages" : "local", recordedAt: new Date().toISOString(), reports: {} };
try {
  for (const p of PARTNERS) {
    const report = await inspectPeer(urls[p.id], { pins });
    // The card does not use the raw file text; drop it to keep the bundle small.
    for (const artifact of Object.values(report.artifacts)) if (artifact) artifact.text = "";
    out.reports[p.id] = report;
    console.log(`${p.id}: ${report.verdict}`);
  }
} finally {
  for (const s of servers) s.close();
}
await writeFile(join(root, "apps/site/src/recorded-reports.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log("Wrote apps/site/src/recorded-reports.json");
