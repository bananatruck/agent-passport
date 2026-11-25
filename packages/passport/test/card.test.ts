// @vitest-environment jsdom
// Rendering tests for <agent-passport-card>: peer text must always render as text.
import { describe, expect, it } from "vitest";
import { AgentPassportCard, machineReadableZone } from "../src/card.js";
import type { PassportReport } from "../src/types.js";

const hostile = `<img src=x onerror="globalThis.__pwned=1"><script>globalThis.__pwned=2</script>`;

function report(overrides: Partial<PassportReport> = {}): PassportReport {
  return {
    version: 1,
    input: "https://peer.example/agents/deals",
    networkUrl: "https://peer.example/agents/deals",
    siteBase: "https://peer.example/agents",
    origin: "https://peer.example",
    networkName: "deals",
    verdict: "changed",
    summary: `Changed ${hostile}`,
    checks: [
      { id: "a", status: "fail", category: "verified", title: hostile, detail: hostile },
      { id: "b", status: "warn", category: "signal", title: "Signal", detail: "A signal, not proof." },
      { id: "c", status: "info", category: "runtime", title: "Runtime", detail: "Enforced by the runtime." },
    ],
    artifacts: {},
    network: {
      name: "deals",
      frontMan: hostile,
      runtimeFrontMan: hostile,
      agents: [],
      origins: [],
      links: {},
      codedTools: null,
      declared: { brand: hostile, description: null, llmRouter: null, peerPolicy: null, allowedPeers: [], sampleQueries: [] },
    },
    digest: { manifestEntry: "a".repeat(64), definition: "b".repeat(64), links: "c".repeat(64), combined: "d".repeat(64) },
    pin: {
      status: "mismatch",
      pin: null,
      changes: [{ kind: "instructions-changed", agent: "x", detail: hostile, after: hostile }],
    },
    checkedAt: "2026-11-18T07:00:00.000Z",
    ...overrides,
  };
}

function mount(r: PassportReport, decide = false): AgentPassportCard {
  const card = document.createElement("agent-passport-card");
  card.decide = decide;
  card.report = r;
  document.body.append(card);
  return card;
}

describe("<agent-passport-card>", () => {
  it("renders hostile peer strings as text, never as markup", () => {
    const card = mount(report());
    const shadow = card.shadowRoot!;
    expect(shadow.querySelector("img")).toBeNull();
    expect(shadow.querySelector("script")).toBeNull();
    expect(shadow.textContent).toContain("<img src=x");
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it("shows the verdict stamp and every check category it has", () => {
    const shadow = mount(report()).shadowRoot!;
    expect(shadow.querySelector(".stamp")?.textContent).toContain("Changed");
    const summaries = [...shadow.querySelectorAll("summary")].map((s) => s.textContent);
    expect(summaries.some((s) => s?.startsWith("Checked by Agent Passport"))).toBe(true);
    expect(summaries.some((s) => s?.startsWith("Signals, not proof"))).toBe(true);
    expect(summaries.some((s) => s?.startsWith("Enforced by the runtime"))).toBe(true);
  });

  it("emits a decision only when asked to decide, and only for unreviewed or changed", () => {
    const decisions: string[] = [];
    const card = mount(report({ verdict: "unreviewed" }), true);
    card.addEventListener("passport-decision", (e) => decisions.push((e as CustomEvent).detail.decision));
    const button = card.shadowRoot!.querySelector<HTMLButtonElement>("button.load")!;
    button.click();
    expect(decisions).toEqual(["load"]);
    expect(card.shadowRoot!.querySelector("button.load")).toBeNull();

    const refused = mount(report({ verdict: "refused" }), true);
    expect(refused.shadowRoot!.querySelector("button")).toBeNull();
    const verified = mount(report({ verdict: "verified" }), true);
    expect(verified.shadowRoot!.querySelector("button")).toBeNull();
  });

  it("builds a 44-character machine-readable zone from report data only", () => {
    const [a, b] = machineReadableZone(report());
    expect(a).toHaveLength(44);
    expect(b).toHaveLength(44);
    expect(a).toMatch(/^[A-Z0-9<]+$/);
    expect(b).toMatch(/^DDDDDDDDDDDDDDDD<CHANGED<20261118/);
  });
});

describe("<agent-passport-card> agent prompts", () => {
  it("says when an agent has no instructions of its own instead of showing nothing", () => {
    const r = report();
    r.network!.agents = [{ name: "helper", description: "", instructions: "", instructionsSha256: "0".repeat(64), tools: [], type: "other", allowSly: { toDownstream: [], toUpstream: [] } }];
    const text = mount(r).shadowRoot!.textContent ?? "";
    expect(text).toContain("What each agent is told (1)");
    expect(text).toContain("generic default prompt");
  });
});
