#!/usr/bin/env node
// Records silent demo footage of the live site for the submission video, following the
// shots in docs/VIDEO_SCRIPT.md, at 1920x1080, in Playwright's bundled Chromium.
// Each scene lasts as long as its narration takes to read aloud at a normal pace, so the
// author can read the script over the footage (scripts/mux-voice.sh adds the voice).
//
//   node scripts/record-demo.mjs                       # the live site
//   SITE_URL=http://127.0.0.1:4173/ node scripts/record-demo.mjs   # a local `pnpm demo`
//
// Writes submission/video/agent-passport-footage.mp4 (H.264, no audio) and
// submission/video/scenes.json (each scene's start time in the final footage).
// Needs ffmpeg on the PATH. The footage has no voice, music or explanatory captions.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "submission/video");
const SITE = process.env.SITE_URL || "https://bananatruck.github.io/agent-passport/";
const WIDTH = 1920;
const HEIGHT = 1080;

// Scene lengths in seconds: the narration's word count at about 150 words per minute,
// plus a short pause. They are listed with the narration in docs/VIDEO_SCRIPT.md.
export const SCENES = [
  { id: 1, title: "The idea", seconds: 17 },
  { id: 2, title: "Harbor Ferry is verified", seconds: 18 },
  { id: 3, title: "Tidewhistle Rooms changed", seconds: 17 },
  { id: 4, title: "Gull Deals is refused", seconds: 18 },
  { id: 5, title: "Who stands behind each line", seconds: 15 },
  { id: 6, title: "For publishers", seconds: 17 },
  { id: 7, title: "Close", seconds: 6 },
];

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

/** Scroll smoothly so an element's top sits `offset` pixels below the top of the window. */
async function glideTo(page, selector, offset = 24) {
  await page.evaluate(
    ([sel, off]) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - off;
      window.scrollTo({ top, behavior: "smooth" });
    },
    [selector, offset],
  );
  await page.waitForTimeout(1200);
}

async function waitForStamp(page, text) {
  await page.waitForFunction(
    (t) => [...document.querySelectorAll("[data-demo-passports] agent-passport-card")].some((c) => c.shadowRoot?.querySelector(".stamp")?.textContent?.includes(t)),
    text,
    { timeout: 30000 },
  );
}

async function allowNextConsent(page) {
  const allow = page.locator('#agent-app .ns-consent-actions button[data-d="allow"]').first();
  await allow.waitFor({ timeout: 30000 });
  await allow.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await allow.click();
}

async function main() {
  // Clear only the temporary recording; a finished video (for example agent-passport-final.mp4
  // with the author's voice) stays until a new recording succeeds.
  await rm(join(outDir, "raw"), { recursive: true, force: true });
  await mkdir(join(outDir, "raw"), { recursive: true });
  const browser = await chromium.launch({ executablePath: chromiumPath(), headless: true });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    recordVideo: { dir: join(outDir, "raw"), size: { width: WIDTH, height: HEIGHT } },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const videoStart = Date.now();
  await page.goto(SITE, { waitUntil: "networkidle" });
  await page.waitForSelector("#agent-app .ns-input", { timeout: 30000 });
  // The AI model settings panel lists provider names; it must stay closed.
  await page.evaluate(() => document.querySelectorAll("#agent-app details.ns-settings").forEach((d) => d.removeAttribute("open")));
  await page.waitForTimeout(1500);
  const footageStart = Date.now();
  const starts = [];

  async function scene(def, body) {
    const begin = Date.now();
    starts.push({ id: def.id, title: def.title, start: (begin - footageStart) / 1000 });
    await body();
    const left = def.seconds * 1000 - (Date.now() - begin);
    if (left > 0) await page.waitForTimeout(left);
  }

  await scene(SCENES[0], async () => {
    await page.mouse.move(1300, 500);
  });
  await scene(SCENES[1], async () => {
    await glideTo(page, "#live-demo", 8);
    await page.click("#agent-app .ns-input");
    await page.type("#agent-app .ns-input", "Plan a Saturday on Gull Island for two", { delay: 55 });
    await page.waitForTimeout(500);
    await page.click("#agent-app #ns-send");
    await allowNextConsent(page);
    await waitForStamp(page, "Verified");
    await glideTo(page, "[data-demo-passports]", 16);
  });
  await scene(SCENES[2], async () => {
    await allowNextConsent(page);
    await waitForStamp(page, "Changed");
    await glideTo(page, "[data-demo-passports]", 16);
  });
  await scene(SCENES[3], async () => {
    await allowNextConsent(page);
    await waitForStamp(page, "Refused");
    await glideTo(page, "[data-demo-passports]", 16);
  });
  await scene(SCENES[4], async () => {
    await page.waitForFunction(() => document.querySelector("#agent-app .ns-inputbar")?.getAttribute("data-turn-active") === "false", null, { timeout: 30000 });
    await page.waitForTimeout(3000);
    await glideTo(page, "#stamps", 8);
  });
  await scene(SCENES[5], async () => {
    await glideTo(page, "#publishers", 8);
    await page.waitForTimeout(3500);
    await page.getByRole("tab", { name: "CI check" }).click();
  });
  await scene(SCENES[6], async () => {
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
    await page.waitForTimeout(1200);
  });

  const total = Math.round((Date.now() - footageStart) / 100) / 10;
  const trimSeconds = (footageStart - videoStart) / 1000;
  await context.close();
  await browser.close();

  const raw = (await readdir(join(outDir, "raw"))).find((f) => f.endsWith(".webm"));
  if (!raw) throw new Error("Playwright wrote no video.");
  const webm = join(outDir, "raw", raw);
  const mp4 = join(outDir, "agent-passport-footage.mp4");
  const pending = join(outDir, "raw", "footage.mp4");
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-ss", trimSeconds.toFixed(2), "-i", webm, "-t", String(total),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
    "-movflags", "+faststart", "-an", pending,
  ]);
  await rename(pending, mp4);
  await rename(webm, join(outDir, "raw", "footage.webm"));
  await writeFile(join(outDir, "scenes.json"), `${JSON.stringify({ site: SITE, totalSeconds: total, scenes: starts }, null, 2)}\n`);
  console.log(`Wrote ${mp4} (${total} s) and scenes.json`);
  for (const s of starts) console.log(`  ${s.id} ${s.start.toFixed(1).padStart(6)} s  ${s.title}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
