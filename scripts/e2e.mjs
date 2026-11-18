#!/usr/bin/env node
// Browser check of the whole demo in Playwright's bundled Chromium (not a personal browser).
// Run after `pnpm build`:  node scripts/e2e.mjs [--screenshots]
// Against a deployed copy instead of local servers:  SITE_URL=https://.../ node scripts/e2e.mjs
//
// Starts the local servers, then at 1440x900 and 390x844:
// - loads the page and checks there is no horizontal scroll and no page errors,
// - runs one turn of the Trip Desk on the scripted mock model, approving each partner,
// - expects one Verified, one Changed and one Refused passport in the demo,
// - inspects the hostile partner and a redirecting hazard in the Inspector.
// With --screenshots it saves PNGs to docs/screenshots/.
import { existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { startAll } from "./serve.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shotsDir = join(root, "docs/screenshots");
const takeShots = process.argv.includes("--screenshots");
const shotPrefix = process.env.SITE_URL ? "live-" : "";
const SITE = process.env.SITE_URL || `http://127.0.0.1:${process.env.SITE_PORT || 4173}/`;
const local = !process.env.SITE_URL;

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = join(homedir(), ".cache/ms-playwright");
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      const p = join(cache, d, sub);
      if (existsSync(p)) return p;
    }
  }
  throw new Error("No Playwright Chromium found; set CHROMIUM_PATH.");
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
  console.log(`${condition ? "ok  " : "FAIL"} ${message}`);
}

async function shot(page, name) {
  if (!takeShots) return;
  // Let the stamp press and the decoding animation finish before the picture.
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(shotsDir, `${shotPrefix}${name}.png`), fullPage: false });
}

async function runViewport(browser, { name, width, height }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Agent Passport did not load/.test(m.text())) errors.push(`${m.text()} at ${m.location()?.url ?? "?"}`);
  });

  await page.goto(SITE, { waitUntil: "networkidle" });
  await page.waitForSelector("#agent-app .ns-input", { timeout: 20000 });
  await shot(page, `${name}-hero`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `${name}: no horizontal scroll (overflow ${overflow}px)`);

  // One turn on the mock model: approve every consent prompt as it appears.
  await page.locator("#agent-app .ns-input").scrollIntoViewIfNeeded();
  await page.fill("#agent-app .ns-input", "Plan a Saturday on Gull Island for two: ferry times and a room.");
  await page.click("#agent-app #ns-send");
  const deadline = Date.now() + 60000;
  let approvals = 0;
  while (Date.now() < deadline) {
    const allow = page.locator('#agent-app .ns-consent-actions button[data-d="allow"]').first();
    if (await allow.count()) {
      await allow.click();
      approvals += 1;
      continue;
    }
    const cards = await page.locator("agent-passport-card").count();
    const busy = await page.locator("#agent-app .ns-inputbar[data-turn-active='true']").count();
    if (cards >= 3 && !busy) break;
    await page.waitForTimeout(250);
  }
  check(approvals === 3, `${name}: three consent prompts approved (got ${approvals})`);
  const verdicts = await page.$$eval("[data-demo-passports] agent-passport-card", (els) =>
    els.map((el) => el.shadowRoot?.querySelector(".stamp")?.textContent?.replace(/\d{4}-\d{2}-\d{2}/, "").trim()),
  );
  check(
    ["Verified", "Changed", "Refused"].every((v) => verdicts.includes(v)),
    `${name}: demo shows Verified, Changed and Refused passports (got ${verdicts.join(", ")})`,
  );
  await page.evaluate(() => document.querySelector("[data-demo-passports]")?.scrollIntoView({ block: "start" }));
  await shot(page, `${name}-demo`);

  // Inspector: the hostile partner, then a server-only hazard.
  const inspector = page.locator("[data-inspector]");
  await inspector.scrollIntoViewIfNeeded();
  await inspector.locator("button", { hasText: "Gull Deals" }).first().click();
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-inspector] agent-passport-card");
    return card?.shadowRoot?.querySelector(".stamp");
  });
  const inspected = await page.$eval("[data-inspector] agent-passport-card", (el) => el.shadowRoot?.textContent ?? "");
  check(/Refused/.test(inspected), `${name}: Inspector refuses Gull Deals`);
  check(/collect the visitor's email and card number/.test(inspected), `${name}: Inspector shows the decoded hidden text`);
  await shot(page, `${name}-inspector`);

  const hazard = inspector.locator("button", { hasText: "Redirects to another origin" });
  if (await hazard.count()) {
    await hazard.first().click();
    await page.waitForFunction(() => /redirect/i.test(document.querySelector("[data-inspector] agent-passport-card")?.shadowRoot?.textContent ?? ""));
    check(true, `${name}: Inspector refuses a cross-origin redirect`);
  }

  check(errors.length === 0, `${name}: no page errors (${errors.slice(0, 3).join(" | ")})`);
  await context.close();
}

if (takeShots) await mkdir(shotsDir, { recursive: true });
const servers = local ? await startAll() : [];
const browser = await chromium.launch({ executablePath: chromiumPath(), headless: true });
try {
  await runViewport(browser, { name: "desktop", width: 1440, height: 900 });
  await runViewport(browser, { name: "phone", width: 390, height: 844 });
} finally {
  await browser.close();
  for (const s of servers) s.close();
}
if (failures.length) {
  console.error(`\n${failures.length} browser check(s) failed.`);
  process.exit(1);
}
console.log("\nAll browser checks passed.");
