import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../bin/agent-passport.mjs";
import * as core from "../src/index.js";
import { inspect, peer } from "./helpers.js";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});
let directory = "";
afterEach(async () => { vi.mocked(writeFile).mockRestore(); if (directory) await rm(directory, { recursive: true, force: true }); });

it("keeps existing pins and removes the temporary file after a partial write fails", async () => {
  directory = await mkdtemp(join(tmpdir(), "pin-save-"));
  const destination = join(directory, "pins.json");
  const report = await inspect();
  const original = core.serializePinFile({ version: 1, pins: [core.createPin(report)] });
  await writeFile(destination, original);
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(writeFile).mockImplementationOnce(async (path, data) => {
    await actual.writeFile(path, String(data).slice(0, 20));
    throw Object.assign(new Error("No space left"), { code: "ENOSPC" });
  });
  let error = "";
  expect(await runCli(["pin", peer, "--file", destination], { api: { ...core, inspectPeer: async () => report }, stdout: () => {}, stderr: text => { error += text; } })).toBe(1);
  expect(error).toContain("No space left");
  expect(await readFile(destination, "utf8")).toBe(original);
  expect(await readdir(directory)).toEqual(["pins.json"]);
});
