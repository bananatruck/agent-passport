#!/usr/bin/env node
// Writes apps/site/public/passports.json: the Trip Desk publisher's review of its partners.
// Run after building the library:  node scripts/make-pins.mjs
//
// It serves each reviewed partner folder on a throwaway loopback port, inspects it with
// Agent Passport, pins the result, and records the pin under the partner's production
// URL. Digests cover content only (never the URL), so the same pin matches the partner
// when it is served locally by scripts/serve.mjs or from raw.githubusercontent.com.
//
// Harbor Ferry is pinned from its live folder. Tidewhistle Rooms is pinned from
// peers/_reviewed/tidewhistle_rooms, the version before its publisher changed it.
// Gull Deals is not pinned: it is refused, and the CLI refuses to pin a refused network.
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPin, inspectPeer, serializePinFile } from "../packages/passport/dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_PEERS = "https://raw.githubusercontent.com/bananatruck/agent-passport/main/peers";

const REVIEWS = [
  {
    id: "harbor_ferry",
    folder: "peers/harbor_ferry",
    label: "Harbor Ferry",
    note: "Timetable and fares only; calls no other sites.",
  },
  {
    id: "tidewhistle_rooms",
    folder: "peers/_reviewed/tidewhistle_rooms",
    label: "Tidewhistle Rooms",
    note: "Rooms and prices; bookings by phone, no payment details in chat.",
  },
];

function serveFolder(folder) {
  const server = createServer(async (req, res) => {
    const name = (req.url || "/").split("?")[0].replace(/^\/+/, "");
    if (!/^[\w.-]+\.json$/.test(name)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(join(root, folder, name));
      res.writeHead(200, { "content-type": "application/json" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const pins = [];
for (const review of REVIEWS) {
  const server = await serveFolder(review.folder);
  const { port } = server.address();
  try {
    const report = await inspectPeer(`http://127.0.0.1:${port}/${review.id}`);
    if (report.verdict === "refused") {
      throw new Error(`${review.id} is refused: ${report.summary}`);
    }
    const pin = createPin(report, {
      label: review.label,
      reviewedBy: "Tidewater Trip Desk publisher",
      note: review.note,
    });
    pins.push({ ...pin, network: `${PROD_PEERS}/${review.id}/${review.id}` });
    console.log(`Pinned ${review.id}: ${pin.digest.combined}`);
  } finally {
    server.close();
  }
}

const out = join(root, "apps/site/public/passports.json");
await writeFile(out, serializePinFile({ version: 1, pins }));
console.log(`Wrote ${out}`);
