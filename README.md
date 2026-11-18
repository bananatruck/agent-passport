# Agent Passport

Check a partner site's AI agents before they run in your visitor's browser, and keep checking that they are still the version you reviewed.

Live demo: https://bananatruck.github.io/agent-passport/

![Agent Passport: a verified partner passport on the Tidewater Trip Desk demo](docs/screenshots/live-desktop-hero.png)

Agent Passport is an entry for the [Open Agentic Web Challenge](https://cognizant-agenticweb.devpost.com/).
It is a small, dependency-free TypeScript library, a web component and a CLI for sites that follow the [Minimum Viable Specification for a Worldwide Agentic Web](https://github.com/cognizant-ai-labs/agentic-web/blob/main/docs/worldwide_agentic_web_mvp_spec.md) (MVP Profile 0.2).
The demo site, Tidewater Trip Desk, is itself an open agentic website: its own agent network links to three partner sites, and Agent Passport stands between the reference runtime and every partner.

## The problem

On the open agentic web, a site can load a partner site's published agent network and run it in the visitor's browser, on the visitor's model and key.
The reference runtime asks the visitor before it contacts the partner, but the prompt shows only the partner's address and the request, not what will run.
The site's publisher reviews a partner once, when adding the link, and the partner can change its instructions at any time afterwards.
Every later visitor then runs the new version under the first site's name.

## What Agent Passport does

It fetches the partner's `agent-manifest.json`, network definition and `links.json` with strict rules, checks them against the spec, computes what the model will actually read, and compares the result with a pin that the calling site's publisher committed in `passports.json`.
The result is a passport page with one of four stamps.

| Stamp | Exact meaning |
| --- | --- |
| Verified | Fetched without redirects, no check failed (warnings may be listed), and identical by SHA-256 to the version this site's publisher pinned. Not a promise that the agents are harmless. |
| Unreviewed | No check failed, but this site's publisher has not pinned it. The visitor decides whether to load it. |
| Changed | No check failed, but it differs from the pinned version. The card lists what changed, and the guard does not load it. |
| Refused | Failed a fetch, size, format, structure or hidden-text check. It cannot load. |

The pin is the idea that matters: a publisher's review travels with the link to every visitor, instead of living in one person's browser.
The same check can run in CI (this repository ships an on-demand partner drift workflow; a real site would put it on a schedule), so a publisher can learn that a partner changed before a visitor does.

## Screenshots

| The live demo | The Inspector | On a phone |
| --- | --- | --- |
| ![Three partner passports after one request: Verified, Changed, Refused](docs/screenshots/live-desktop-demo.png) | ![The Inspector refusing Gull Deals and decoding its hidden text](docs/screenshots/live-desktop-inspector.png) | ![The demo at 390 pixels wide](docs/screenshots/live-phone-demo.png) |

All screenshots come from `SITE_URL=https://bananatruck.github.io/agent-passport/ node scripts/e2e.mjs --screenshots`, which drives the live demo in Chromium.

## What is checked, and what is not

Every line on the card says who stands behind it.

- Checked by Agent Passport: no redirects (a browser hides where a redirect goes, and the spec treats a cross-origin redirect as a new destination); HTTPS outside loopback; no credentials or referrer sent; byte limits enforced while streaming; timeouts; strict UTF-8 JSON with no duplicate keys; the exact network name; a front agent that matches what the runtime will actually run; unique agent names; every tool reference classifiable the way the runtime classifies it; no executable agent without a declared code bundle (the bundle itself is fetched later by the runtime and is not checked); no bidirectional controls or invisible Unicode tag characters anywhere in the manifest or definition (the hidden text is decoded and shown); SHA-256 digests of the effective network, including `{token}` substitutions and the partner's `links.json`.
- Enforced by the reference runtime, not by Agent Passport: the partner runs on your router and model, never receives your key, stays within your step limit, and sees private context only through your allow rules.
- Stated by the partner, not verified: brand, descriptions, the router it names, its peer policy.
- Signals, not proof: instructions that ask for passwords, keys or card numbers, tell the model to ignore earlier instructions, or act without telling the visitor.
- Not checked: signatures (MVP Profile 0.2 defines none), the behaviour of a model, MCP servers' own tools, and a malicious calling site.

The full threat model is in [docs/SPEC.md](docs/SPEC.md).

## Gaps in the reference runtime that Agent Passport closes

These come from reading the runtime's source (`apps/site/public/runtime/`, vendored unmodified), and each one is closed by a check that has a test.

- It runs the first agent that has instructions and does not compare it with the manifest's `front_man`.
- It rewrites every string through `commondefs.replacement_strings`, so the raw JSON a reviewer reads is not what the model reads.
- It keeps the last of two agents with the same name instead of rejecting the network.
- It parses definitions with its own HOCON parser, which merges duplicate keys where a JSON parser keeps the last one, so one document can mean one thing to a checker and another to the runtime.
- It fetches peer files with default `fetch`: redirects are followed to any origin, with no size limit or timeout.
- A partner's files could change between a check and the runtime's own fetch; the guard makes the runtime compile exactly the verified bytes.

## Use it on your agentic site

Two lines after the runtime boots:

```js
import { installPassportGuard } from "./vendor/agent-passport/guard.js";
installPassportGuard(engine, { pins: () => loadPins(), parseHocon });
```

Pin a partner after you review it, commit the file, and check it in CI:

```sh
node packages/passport/bin/agent-passport.mjs pin https://partner.example/agents/rooms --file passports.json --label "Partner rooms"
node packages/passport/bin/agent-passport.mjs check --file passports.json
```

API details are in [packages/passport/README.md](packages/passport/README.md).

## Run the demo offline

```sh
pnpm install
pnpm demo
```

Then open http://127.0.0.1:4173/.
`pnpm demo` builds everything and serves the site and each partner on its own loopback port, so every partner is a real cross-origin peer.
Without a key, the site's default model is the runtime's built-in scripted mock, which calls each partner once; add your own key in AI model settings to use a real model.

## Repository

- `packages/passport/`: the library, the `<agent-passport-card>` web component, the runtime guard and the CLI.
- `apps/site/`: the Tidewater Trip Desk demo (React, Tailwind) with its agent network, manifest, pins and the vendored runtime.
- `peers/`: the partner-site fixtures; `scripts/build-fixtures.mjs` rebuilds them.
- `scripts/`: the local demo server, the pin generator and the browser checks.
- `docs/SPEC.md`: requirements, threat model, API and test plan.

## Status

Built in one night for the Open Agentic Web Challenge, then deployed.

- Working and tested: the checker, pins, CLI, card, runtime guard, and the Tidewater Trip Desk demo with three partner sites, offline and on GitHub Pages.
- Automated checks: 248 unit and integration tests (including runs of the reference runtime's real `Engine`), lint, type-check, the production build, and a Playwright browser run of the whole demo at 1440 by 900 and 390 by 844.
- Not done: signatures (the spec defines none), checking MCP servers, and a re-consent prompt when a pinned partner changes; the guard holds a changed partner instead.
- The design mock-ups in `design/mockups/` are captures of the first layout, because the image model was over its quota during the build.
- How it was built: overnight, by AI coding agents (Claude Opus as tech lead, GPT 6.1 Sol in Codex, Gemini 4 Argon in Antigravity, Grok in Cursor) directed by the author.

## License

MIT for this repository's own code (see `LICENSE`).
The vendored runtime in `apps/site/public/runtime/` is Apache 2.0 (see its `LICENSE.txt`).
Ten UI component files come from Magic UI, Aceternity UI, React Bits and 21st.dev and keep their own licenses; two of them (Aceternity UI) are not open source, so see [docs/CREDITS.md](docs/CREDITS.md) before reusing anything under `apps/site/src/components/ui/`.
