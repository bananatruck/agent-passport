#!/usr/bin/env node
// Copies the built library into the demo site's public folder, so the deployed site serves
// a copy other agentic sites can take without a bundler: vendor/agent-passport/*.js.
import { cp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "packages/passport/dist");
const to = join(root, "apps/site/public/vendor/agent-passport");
await rm(to, { recursive: true, force: true });
await cp(from, to, { recursive: true, filter: (src) => !src.endsWith(".map") });
console.log(`Copied ${from} to ${to}`);
