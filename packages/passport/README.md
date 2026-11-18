# agent-passport

Check a peer agent network against the Open Agentic Web MVP Profile 0.2 and against the version your site reviewed, before its agents run in the visitor's browser.
No runtime dependencies; works in browsers and in Node 22 or newer.
This package is not published to npm; copy `dist/` (the demo site serves a copy at `vendor/agent-passport/`) or use it from this repository.

## Inspect a partner

```js
import { inspectPeer } from "agent-passport";

const report = await inspectPeer("https://partner.example/agents/rooms", {
  pins,                                    // your parsed passports.json, or null
  confirmDestination: async ({ origin, purpose }) => confirm(`Also contact ${origin} for the ${purpose}?`),
});
report.verdict;  // "verified" | "unreviewed" | "changed" | "refused"
report.summary;  // one plain sentence
report.checks;   // every check, each with status and category
report.pin;      // { status: "match" | "mismatch" | "none", pin, changes }
```

`inspectPeer` never throws for problems with the partner: every failure becomes a failed check and the verdict `refused`.
The partner URL follows spec section 3.2: its last path segment is the network name and the rest is the site base, so `https://partner.example/agents/rooms` reads `https://partner.example/agents/agent-manifest.json`.

Options:

- `fetch`: a fetch implementation (default: the global one).
- `pins`: a `PinFile` from `parsePinFile`.
- `limits`: `{ manifestBytes, definitionBytes, linksBytes, timeoutMs, maxDepth, maxKeys }`; defaults 256 KiB, 1 MiB, 64 KiB, 8000 ms, 64 and 20000.
- `allowLoopbackHttp`: allow plain HTTP for localhost, 127.0.0.0/8 and [::1] (default true).
- `confirmDestination`: asked before contacting any second origin, such as a network definition hosted elsewhere; the default refuses.
- `now`: a clock, for tests.

## Pins

```js
import { createPin, parsePinFile, serializePinFile, findPin, comparePin } from "agent-passport";

const pin = createPin(report, { label: "Partner rooms", reviewedBy: "Site publisher", note: "Rooms only" });
const file = serializePinFile({ version: 1, pins: [pin] });   // commit this as passports.json
const pins = parsePinFile(await (await fetch("passports.json")).text());
```

A pin stores the partner URL, the review date and reviewer, four SHA-256 digests (manifest entry with `coded_tools`, effective definition, the partner's `links.json` entry, and a combined digest) and a small snapshot (front agent, per-agent instruction digests, tools, allow rules, origins), so a mismatch can be explained without storing the old text.
`createPin` refuses a refused network.

## The card

```js
import "agent-passport/card";

const card = document.createElement("agent-passport-card");
card.report = report;
card.decide = true; // unreviewed and changed reports get "Load these agents" and "Don't load"
card.addEventListener("passport-decision", (event) => event.detail.decision); // "load" | "decline"
document.body.append(card);
```

The card renders every string from the report with `textContent`, so markup in a partner's names or instructions is shown as text.
Theme it with CSS custom properties on any ancestor: `--ap-ink`, `--ap-paper`, `--ap-guilloche`, `--ap-verified`, `--ap-changed`, `--ap-refused`, `--ap-unreviewed`, `--ap-text`, `--ap-font-display`, `--ap-font-body`, `--ap-font-mono`.

## The runtime guard

```js
import { boot, parseHocon } from "./runtime/index.js";
import { installPassportGuard } from "./vendor/agent-passport/guard.js";

const { engine } = await boot("#agent-app", opts);
const guard = installPassportGuard(engine, {
  pins: () => loadPins(),                       // or a PinFile
  parseHocon,                                   // enables the parser-differential check
  onReport: (report) => showCard(report),
  approveUnreviewed: (report) => askVisitor(report),   // default: do not load
  approveChanged: async () => false,                   // default: do not load
});
```

The guard replaces `engine.resolveRemote` from outside the runtime.
It keeps the runtime's own order: the visitor's consent prompt and the caller's `allowed_peers` check come first, so nothing is fetched for a partner the visitor declined or the policy forbids.
It then inspects the partner, decides by verdict, and lets the runtime compile while a scoped fetch interceptor answers the runtime's manifest, definition and `links.json` requests with exactly the verified bytes, refusing any other request to that partner's origin during the load.
A blocked partner raises `PassportBlockedError`, which the runtime reports to the calling agent as a failed tool call.
It was written against the runtime copy in `apps/site/public/runtime/` (see `UPSTREAM_COMMIT.txt`); the tests run that runtime's real `Engine`.

## CLI

```sh
agent-passport inspect <url> [--json]
agent-passport pin <url> --file passports.json [--label <text>] [--reviewed-by <text>] [--note <text>]
agent-passport check --file passports.json [--json]
```

`check` exits 0 only when every pinned partner is verified, so it can fail a CI job when a partner changes.
From this repository, run it as `node packages/passport/bin/agent-passport.mjs` after `pnpm --filter agent-passport build`.
