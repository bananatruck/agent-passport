#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const usage = {
  inspect: "inspect <url> [--json]\nInspect a peer without loading it. Exit 1 for refused or changed peers.\nExamples:\n  agent-passport inspect https://peer.example/agents/transit\n  agent-passport inspect http://127.0.0.1:8080/transit --json",
  pin: "pin <url> --file <path> [--label <text>] [--reviewed-by <text>] [--note <text>]\nCreate or replace a reviewed pin. Refused peers cannot be pinned.\nExamples:\n  agent-passport pin https://peer.example/agents/transit --file passports.json --label Transit\n  agent-passport pin https://peer.example/agents/transit --file passports.json --reviewed-by Publisher --note Reviewed",
  check: "check --file <path> [--json]\nInspect every pinned peer. Exit 0 only when every peer is verified.\nExamples:\n  agent-passport check --file passports.json\n  agent-passport check --file passports.json --json",
};

/**
 * Exercise command behaviour with the real core and local files.
 * @param {string[]} argv
 * @param {{ api?: typeof import("../src/index.js"), stdout?: (text: string) => void, stderr?: (text: string) => void }} [options]
 */
export async function runCli(argv, { api, stdout = text => process.stdout.write(text), stderr = text => process.stderr.write(text) } = {}) {
  const [command, ...args] = argv;
  if (!command || command === "--help" || command === "-h") {
    stdout("Usage: agent-passport <inspect|pin|check>\nUse <command> --help for options.\nExamples:\n  agent-passport inspect https://peer.example/transit\n  agent-passport check --file passports.json\n");
    return 0;
  }
  if (!Object.hasOwn(usage, command)) { stderr(`Unknown command ${command}. Use agent-passport --help.\n`); return 1; }
  if (args.includes("--help") || args.includes("-h")) { stdout(`Usage: agent-passport ${usage[command]}\n`); return 0; }
  try {
    const flags = new Map();
    const positional = [];
    const allowed = command === "pin" ? ["--file", "--label", "--reviewed-by", "--note"] : command === "check" ? ["--file", "--json"] : ["--json"];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (!arg.startsWith("-")) { positional.push(arg); continue; }
      if (!allowed.includes(arg)) throw new Error(`Unknown option ${arg}.`);
      if (flags.has(arg)) throw new Error(`Repeated option ${arg}.`);
      if (arg === "--json") { flags.set(arg, true); continue; }
      const value = args[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${arg}.`);
      flags.set(arg, value);
    }
    if (positional.length !== (command === "check" ? 0 : 1)) throw new Error(command === "check" ? "check takes no URL argument." : "Supply exactly one peer URL.");
    const file = flags.get("--file");
    if (command !== "inspect" && !file) throw new Error("Missing required --file <path>.");
    const core = api ?? await import("../dist/index.js");
    if (command === "inspect") {
      const report = await core.inspectPeer(positional[0]);
      stdout(flags.has("--json") ? JSON.stringify(report, null, 2) + "\n" : `${report.verdict} ${report.networkUrl ?? positional[0]}: ${report.summary}\n`);
      return report.verdict === "refused" || report.verdict === "changed" ? 1 : 0;
    }
    let pins;
    try { pins = core.parsePinFile(await readFile(file, "utf8")); }
    catch (error) {
      if (command === "pin" && error?.code === "ENOENT") pins = { version: 1, pins: [] };
      else throw error;
    }
    if (command === "pin") {
      const report = await core.inspectPeer(positional[0]);
      if (report.verdict === "refused") throw new Error(`Refusing to pin ${positional[0]}: ${report.checks.filter(c => c.status === "fail").map(c => `${c.code}: ${c.detail}`).join("; ")}`);
      const pin = core.createPin(report, { label: flags.get("--label"), reviewedBy: flags.get("--reviewed-by"), note: flags.get("--note") });
      const previous = core.findPin(pins, pin.network);
      pins.pins = pins.pins.filter(p => p !== previous);
      pins.pins.push(pin);
      await writeFile(file, core.serializePinFile(pins), "utf8");
      stdout(`Pinned ${pin.network} in ${file}\n`);
      return 0;
    }
    const reports = [];
    for (const pin of pins.pins) reports.push(await core.inspectPeer(pin.network, { pins }));
    stdout(flags.has("--json") ? JSON.stringify(reports, null, 2) + "\n" : reports.map(r => `${r.verdict} ${r.networkUrl ?? r.input}${r.pin.changes.length ? ": " + r.pin.changes.map(c => c.kind).join(", ") : ""}\n`).join(""));
    return reports.every(r => r.verdict === "verified") ? 0 : 1;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\nUsage: agent-passport ${usage[command]}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await runCli(process.argv.slice(2));
