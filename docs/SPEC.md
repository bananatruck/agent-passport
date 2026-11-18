# Agent Passport - build spec

Status: binding design document for the overnight build of 2026-11-17.
Every builder (human or agent) reads this before touching code.

## 1. What the hackathon requires

Source: the Official Rules, Overview and Resources pages of `https://cognizant-agenticweb.devpost.com/`, re-read live on 2026-11-17 and identical to the saved copies.
The entry must be a working open agentic website built with standard open web technologies that conforms to the specification at `https://github.com/cognizant-ai-labs/agentic-web` as of the start of the Submission Period (2026-11-11 20:00 PT).
The specification file `docs/worldwide_agentic_web_mvp_spec.md` (MVP Profile 0.2, 6 November 2026) was last changed on 2026-11-10, so the current text is the binding text.
The public site must contain a conforming `.json` file that describes an agent network, a runtime file that runs the network in the browser, an interface for users or agents, an optional interface to configure LLMs and keys, and a network that interacts with the website and optionally with other agentic websites.
Judging Stage One is pass or fail on conformance; Stage Two scores four equally weighted criteria: Technological Implementation, Design, Potential Impact, and Quality of the Idea.
Potential Impact explicitly rewards tools or services the entrant built and shared with the community.
The video must be under two minutes, show the project running in a browser, be public on YouTube, and include the entrant explaining the project; the Overview page adds "(not AI generated)".
The Resources page lists "A trust or identity component that lets agents verify who they're talking to" as a suggested idea.
The FAQ allows any LLM as long as the project is open source; no license is named, so this repo uses MIT for its own code and keeps the vendored runtime under its Apache 2.0 license.
No sponsor account is required: Otari is optional, and the runtime offers bring-your-own-key.

## 2. The problem

In MVP Profile 0.2 a caller site links to a peer network by URL, and after the visitor's approval the peer's published agents run in the visitor's browser, on the visitor's model and key.
The consent prompt in the reference runtime shows the peer's origin and the request text, but not what will run.
The publisher of the caller site reviews a partner once, when adding the link, but the partner can change its instructions, its tools, its links file or the location of its network definition at any time, and every later visitor runs the new version under the caller site's name.
Origin allow-lists are coarse: allowing `https://raw.githubusercontent.com` allows every repository on GitHub.
The reference runtime also has concrete gaps that matter for trust:
It derives the front agent from the first agent that has instructions and does not compare it with the manifest's `front_man`.
It rewrites every string through `commondefs.replacement_strings`, so the raw JSON a reviewer reads is not the text the model reads.
It keeps the last of two agents with the same name instead of rejecting the network.
It parses the definition with its own HOCON parser, so a document with duplicate JSON keys can mean different things to a checker and to the runtime.
It fetches manifests and definitions with default `fetch`, which follows redirects to any origin without a new consent prompt, with no size limit and no timeout.

## 3. The product

Agent Passport is a small, dependency-free TypeScript library plus a web component that checks a peer agent network before it loads and shows the result as a passport page.
Its distinctive idea is the visa: the caller site's publisher reviews a partner network once and commits a `passports.json` file that pins the exact content (SHA-256 digests of the effective network) that was reviewed.
Every visitor's browser then checks the live partner against that pin before any partner agent runs, so the publisher's review travels with the link instead of staying in one person's browser.
A CLI turns the same check into a CI job, so a publisher learns that a partner changed before a visitor does.
The demo site is itself a conforming agentic website: its own trip-desk agent network links to three partner sites, and Agent Passport stands between the runtime and every partner.

## 4. Threat model

### 4.1 What "trust" means here

Agent Passport never says a network is safe.
It says one of four things, and each one has an exact meaning:
`verified`: the network was fetched from the requested origin without redirects, no check failed (warnings may be listed), and the SHA-256 digests of its effective content (canonical JSON after the runtime's substitutions) equal the ones the caller site's publisher pinned on the stated date.
`unreviewed`: no check failed, but the caller site's publisher has not pinned it, so the visitor sees the full card and must approve loading explicitly.
`changed`: no check failed, but its effective content differs from the pin; the card lists what changed and the guard refuses to load it by default.
`refused`: a fetch, size, format, structure or hidden-text check failed, so the network cannot load at all.

### 4.2 Verified by Agent Passport

The manifest is fetched from `<site base>/agent-manifest.json`, derived from the peer URL exactly as spec section 3.2 describes.
HTTPS is required except for loopback hosts during local development.
No redirect is followed: any 3xx or opaque redirect response fails closed, because a browser hides the destination of a redirect and spec section 5 requires a cross-origin redirect to be treated as a new destination.
Requests send no credentials (`credentials: "omit"`), no referrer, and bypass the HTTP cache.
Each artifact has a byte limit enforced while streaming (manifest 256 KiB, definition 1 MiB, links 64 KiB by default) and a timeout (8 seconds by default).
Bodies must be valid UTF-8 and strict JSON, with no duplicate keys at any depth, nesting at most 64 levels and at most 20,000 keys in total.
The manifest has a `networks` entry whose `name` exactly equals the requested network name, with string `front_man` and `hocon` values; no other entry is ever selected.
The definition URL is resolved against the site base; a definition on a different origin is a new destination that needs its own consent before it is fetched.
The definition has a non-empty `tools` array, every agent has a non-empty unique name after trimming, every tool reference is classifiable as an internal agent, an HTTP(S) or `/`-prefixed external network, an MCP reference, or a declared link slot, and the runtime's derived front agent equals the manifest's `front_man`.
An agent with `class` or `toolbox` is an executable definition: it is refused unless the manifest declares a `coded_tools` bundle, and the card warns when that bundle has no SRI digest; the bundle itself is fetched later by the runtime and is not checked by Agent Passport.
Effective instructions are computed with the same `{token}` substitution the runtime applies, and those are the texts that are hashed, diffed and shown.
Any string in the manifest or the definition (including names, descriptions, the brand and instructions) that contains bidirectional control characters or Unicode tag characters (the "ASCII smuggling" block U+E0000 to U+E007F) are refused, and the hidden text is decoded and shown.
The digests are SHA-256 over the canonical JSON of the selected manifest entry plus `coded_tools`, over the canonical JSON of the effective definition, and over the canonical JSON of the peer's `links.json` entry for that network, because the runtime merges that file into the network.
In the runtime guard, the runtime compiles exactly the bytes Agent Passport verified (no second fetch), and the guard checks that the runtime's HOCON parser reads those bytes as the same value JSON.parse does.

### 4.3 Enforced by the runtime, not by Agent Passport

The vendored reference runtime runs a peer on the caller's router and model, never sends the visitor's key to the peer, applies the caller's step limit, filters private context (`sly_data`) through the caller's allow rules, and checks `allowed_peers` per hop.
The card reports these as runtime guarantees and names the runtime version, and it never presents them as something Agent Passport checked.

### 4.4 Declared by the publisher, not verified

The peer's brand, descriptions, `llm_router`, `peer_policy`, tags and sample queries are shown as claims.
Who operates the peer's domain is not verified: an origin is not a legal identity.

### 4.5 Signals, not proof

Instructions that ask for passwords, API keys, card numbers or one-time codes, that tell the model to ignore earlier instructions or to act without telling the visitor, that are unusually long, or that contain zero-width characters, produce warnings.
A clean signal list does not mean the instructions are harmless; the card says so in plain words.

### 4.6 Out of scope

Signatures are not part of MVP Profile 0.2, so Agent Passport does not implement or claim them.
It does not sandbox or evaluate model behaviour, does not check MCP servers' own tools, and does not protect against a malicious caller site, which controls the page that runs the guard.

## 5. Component API (package `agent-passport`)

```ts
type Verdict = "verified" | "unreviewed" | "changed" | "refused";

function inspectPeer(networkUrl: string, options?: InspectOptions): Promise<PassportReport>;
function createPin(report: PassportReport, meta?: { label?: string; reviewedBy?: string; note?: string; now?: Date }): PinEntry;
function comparePin(report: PassportReport, pin: PinEntry): { status: "match" | "mismatch"; changes: Change[] };
function findPin(pins: PinFile | null | undefined, networkUrl: string): PinEntry | null;
function parsePinFile(text: string): PinFile; // validates shape, throws PassportError on bad input
function installPassportGuard(engine: NsdeployEngine, options: GuardOptions): GuardHandle;
// <agent-passport-card> custom element: set .report (and optionally .decide = true); in decide mode it emits "passport-decision" with detail { decision: "load" | "decline" }.
```

`InspectOptions` has `fetch` (injectable), `pins`, `limits`, `allowLoopbackHttp` (default true), `confirmDestination({ origin, url, purpose })` for any extra origin such as a cross-origin definition (default: refuse), and `now`.
`PassportReport` has `verdict`, a one-sentence `summary`, `checks` (each with `id`, `status` pass, fail, warn or info, `category` verified, runtime, declared, signal or not-checked, `title`, `detail`), the parsed `network` summary (agents with effective instructions and their digests, tool references, every origin the network may contact, private-context allow rules, coded tools), `artifacts` (URL, origin, byte length, digest), `digest`, and `pin` (`status` match, mismatch or none, plus `changes`).
`PinFile` is `{ "version": 1, "pins": PinEntry[] }`, and a `PinEntry` stores the network URL, label, review date, reviewer, digests and a small snapshot (front agent, per-agent instruction digests and tool lists, origins, allow rules) so a later mismatch can be explained without storing the old text.
Errors carry stable codes such as `URL_INVALID`, `HTTPS_REQUIRED`, `REDIRECT_REFUSED`, `TOO_LARGE`, `TIMEOUT`, `NOT_JSON`, `DUPLICATE_KEY`, `NO_SUCH_NETWORK`, `FRONT_MAN_MISMATCH`, `DUPLICATE_AGENT`, `MISSING_TOOL`, `UNDECLARED_CODE`, `HIDDEN_TEXT`, `DESTINATION_DECLINED`.
The CLI (`agent-passport inspect <url>`, `agent-passport pin <url> --file passports.json --label <text>`, `agent-passport check --file passports.json`) exits 0 when every pin matches and 1 otherwise, with `--json` for machines.

## 6. Demo

The demo site, "Tidewater Trip Desk", is a static agentic website: `agent-manifest.json`, `trip_desk.network.json`, `links.json`, `passports.json`, `site-actions.js`, the vendored runtime under `runtime/`, and a page built with React.
Its front agent links to three partner networks through named links: `harbor_ferry` (valid and pinned), `tidewhistle_rooms` (pinned, then changed by its publisher to ask for card numbers), and `gull_deals` (hostile: hidden tag-character instructions, a front agent that differs from its manifest, and a duplicate agent name).
Locally, `pnpm demo` serves the site and each partner on separate loopback ports, so every partner is a real cross-origin peer, and serves extra hostile fixtures that need a server (redirect to another origin, an endless body, a slow response).
On GitHub Pages the partners are served from `raw.githubusercontent.com`, a different origin with open CORS.
With no key, the site's published default router is the runtime's built-in `browser://mock` model, which calls each tool once, so the full flow runs offline and is labelled as a scripted demo model.
With a key (OpenRouter, Otari or any OpenAI-compatible router that allows browser calls), the same flow runs on a real model.
The page also has an Inspector where anyone can paste a peer URL or pick a fixture, and a publisher section with the two-line install, the pin file and the CI check.
Demo flow for the video: ask the trip desk to plan a day trip, approve contact with the ferry and see a green verified stamp, approve contact with the guesthouse and see it held as changed with the new card-number instruction highlighted, approve contact with the deals site and see it refused with its hidden text decoded, then show the pin file and the CI check failing on the changed partner.

## 7. Test plan

Unit tests (Vitest, Node) cover URL derivation, every fetch rule against a local HTTP server (redirect same-origin and cross-origin, 404, HTML content type, oversized with and without Content-Length, endless stream, timeout, invalid UTF-8, BOM), strict JSON (duplicate keys at depth, depth and key limits, `__proto__` keys not polluting), manifest selection (exact name only, near-miss names refused), definition structure (missing tools, duplicate and whitespace-colliding names, front-agent mismatch, missing references, link slots, external and MCP references, undeclared code), effective-instruction substitution, hidden-text detection and decoding, digests (stable under key order, changed by any effective change, changed by links.json), pins (create, match, every change kind), the verdict table, and the CLI exit codes.
Guard tests run the vendored runtime's `Engine` in Node with a fake fetch and prove that a refused or changed peer never compiles, that a verified peer compiles from the verified bytes even if the server changes between the check and the compile, and that a declined consent sends no request at all.
Rendering tests check that the card writes peer text with `textContent` only, so markup in a peer's names or instructions is shown as text.
An adversarial review (Cursor, grok-4.7-high) tries to make the card say `verified` for a malicious or malformed manifest; every finding becomes a failing test first.
Browser checks run in Playwright's bundled Chromium at 1440 by 900 and 390 by 844, through the whole demo flow, with screenshots saved to `docs/screenshots/`.
Lint (ESLint), type-check (`tsc --noEmit`), tests and the production build must all pass before any push.
