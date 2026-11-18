// <agent-passport-card>: renders a PassportReport as a passport page.
//
// Security rule for this file: every string that comes from a report (and so possibly
// from a hostile peer) is written with textContent or as an attribute value through
// setAttribute on our own elements. innerHTML is used only for the static stylesheet.
//
// Usage:
//   import "agent-passport/card";
//   const card = document.createElement("agent-passport-card");
//   card.report = report;            // a PassportReport
//   card.decide = true;              // show "Load these agents" / "Don't load" buttons
//   card.addEventListener("passport-decision", (e) => e.detail.decision); // "load" | "decline"
//
// Theme with CSS custom properties on any ancestor: --ap-ink, --ap-paper, --ap-guilloche,
// --ap-verified, --ap-changed, --ap-refused, --ap-unreviewed, --ap-text, --ap-font-display,
// --ap-font-body, --ap-font-mono.

import type { Check, CheckCategory, PassportReport, Verdict } from "./types.js";

export const VERDICT_LABEL: Record<Verdict, string> = {
  verified: "Verified",
  unreviewed: "Unreviewed",
  changed: "Changed",
  refused: "Refused",
};

export const VERDICT_MEANING: Record<Verdict, string> = {
  verified: "Same content this site's publisher reviewed and pinned. Not a promise that the agents are harmless.",
  unreviewed: "Passed every check, but this site's publisher has not reviewed it. You decide.",
  changed: "Passed the checks, but differs from the version this site's publisher reviewed.",
  refused: "Failed a check, so its agents cannot load.",
};

const CATEGORY_TITLE: Record<CheckCategory, string> = {
  verified: "Checked by Agent Passport",
  runtime: "Enforced by the runtime, not by Agent Passport",
  declared: "Stated by the partner, not verified",
  signal: "Signals, not proof",
  "not-checked": "Not checked",
};

const CATEGORY_ORDER: CheckCategory[] = ["verified", "signal", "runtime", "declared", "not-checked"];

/** Machine-readable zone: two 44-character lines in the passport style, from real report data. */
export function machineReadableZone(report: PassportReport): [string, string] {
  const clean = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "<")
      .replace(/^<+|<+$/g, "");
  const pad = (s: string) => (s + "<".repeat(44)).slice(0, 44);
  const name = clean(report.networkName ?? "UNKNOWN");
  const host = clean(report.origin ? new URL(report.origin).host : "UNKNOWN");
  const digest = (report.digest?.combined ?? "").slice(0, 16).toUpperCase() || "NODIGEST";
  return [pad(`P<AGT${host}<<${name}`), pad(`${digest}<${clean(VERDICT_LABEL[report.verdict])}<${(report.checkedAt ?? "").slice(0, 10).replace(/-/g, "")}`)];
}

const STYLE = `
:host { display: block; color: var(--ap-text, #14212B); font-family: var(--ap-font-body, "Public Sans", system-ui, sans-serif); }
:host([hidden]) { display: none; }
* { box-sizing: border-box; }
.page { position: relative; overflow: hidden; border-radius: 14px 4px 14px 4px; background: var(--ap-paper, #E9F1EE);
  border: 1px solid color-mix(in srgb, var(--ap-ink, #0E2A3B) 22%, transparent); padding: 20px 20px 14px; }
.guilloche { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; opacity: .55; }
.content { position: relative; }
.head { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start; }
.kicker { font-size: 12px; color: color-mix(in srgb, var(--ap-text, #14212B) 70%, transparent); margin: 0 0 2px; }
h3 { margin: 0; font-family: var(--ap-font-display, "Big Shoulders Display", Impact, sans-serif); font-weight: 800; font-size: 30px; line-height: 1; letter-spacing: .01em; color: var(--ap-ink, #0E2A3B); overflow-wrap: anywhere; }
.origin { margin: 6px 0 0; font-family: var(--ap-font-mono, "JetBrains Mono", ui-monospace, monospace); font-size: 12px; overflow-wrap: anywhere; }
.stamp { --c: var(--ap-unreviewed, #2F4F9E); justify-self: end; transform: rotate(-8deg); border: 3px double var(--c); color: var(--c);
  border-radius: 8px; padding: 6px 10px; font-family: var(--ap-font-display, "Big Shoulders Display", Impact, sans-serif); font-weight: 800; font-size: 22px; line-height: 1;
  text-align: center; background: color-mix(in srgb, var(--c) 7%, transparent); }
.stamp small { display: block; font-family: var(--ap-font-body, system-ui, sans-serif); font-weight: 600; font-size: 10px; margin-top: 3px; }
.stamp.verified { --c: var(--ap-verified, #1F7A4D); }
.stamp.changed { --c: var(--ap-changed, #A86A12); }
.stamp.refused { --c: var(--ap-refused, #B42318); }
.stamp.press { animation: press .42s cubic-bezier(.2,.9,.3,1.3) both; }
@keyframes press { 0% { transform: rotate(-8deg) scale(1.9); opacity: 0; } 70% { transform: rotate(-8deg) scale(.94); opacity: 1; } 100% { transform: rotate(-8deg) scale(1); } }
@media (prefers-reduced-motion: reduce) { .stamp.press { animation: none; } }
.summary { margin: 14px 0 4px; font-size: 15px; line-height: 1.5; }
.meaning { margin: 0 0 12px; font-size: 13px; color: color-mix(in srgb, var(--ap-text, #14212B) 75%, transparent); }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px 16px; margin: 0 0 12px; }
.facts div { min-width: 0; }
.facts dt { font-size: 11px; color: color-mix(in srgb, var(--ap-text, #14212B) 65%, transparent); }
.facts dd { margin: 0; font-weight: 600; font-size: 14px; overflow-wrap: anywhere; }
details { border-top: 1px solid color-mix(in srgb, var(--ap-ink, #0E2A3B) 15%, transparent); padding: 8px 0; }
summary { cursor: pointer; font-weight: 600; font-size: 14px; list-style-position: inside; }
summary:focus-visible, button:focus-visible { outline: 3px solid var(--ap-unreviewed, #2F4F9E); outline-offset: 2px; border-radius: 4px; }
ul { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
li { display: grid; grid-template-columns: 18px 1fr; gap: 6px; font-size: 13px; line-height: 1.45; }
li .mark { font-weight: 800; }
li.fail .mark { color: var(--ap-refused, #B42318); }
li.warn .mark { color: var(--ap-changed, #A86A12); }
li.pass .mark { color: var(--ap-verified, #1F7A4D); }
li .t { font-weight: 600; }
li .d { display: block; color: color-mix(in srgb, var(--ap-text, #14212B) 80%, transparent); overflow-wrap: anywhere; }
.change { border-left: 3px solid var(--ap-changed, #A86A12); padding: 6px 10px; background: color-mix(in srgb, var(--ap-changed, #A86A12) 8%, transparent); border-radius: 0 6px 6px 0; }
.change.refused { border-left-color: var(--ap-refused, #B42318); background: color-mix(in srgb, var(--ap-refused, #B42318) 8%, transparent); }
.change pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 6px 0 0; font-family: var(--ap-font-mono, ui-monospace, monospace); font-size: 12px; }
.mrz { margin: 12px 0 0; padding-top: 10px; border-top: 1px dashed color-mix(in srgb, var(--ap-ink, #0E2A3B) 35%, transparent);
  font-family: var(--ap-font-mono, "JetBrains Mono", ui-monospace, monospace); font-size: 11px; line-height: 1.5; letter-spacing: .08em; color: var(--ap-ink, #0E2A3B); overflow-wrap: anywhere; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
button { font: inherit; font-weight: 600; font-size: 14px; border-radius: 999px; padding: 9px 16px; cursor: pointer; border: 1px solid var(--ap-ink, #0E2A3B); }
button.load { background: var(--ap-ink, #0E2A3B); color: var(--ap-paper, #E9F1EE); }
button.decline { background: transparent; color: var(--ap-ink, #0E2A3B); }
.decided { margin-top: 10px; font-size: 13px; font-weight: 600; }
`;

const GUILLOCHE_PATH = (() => {
  // A fixed rose-curve pattern, generated once; it carries no data.
  const parts: string[] = [];
  for (let k = 0; k < 7; k++) {
    let d = "";
    for (let i = 0; i <= 360; i += 3) {
      const t = (i * Math.PI) / 180;
      const r = 120 + 26 * Math.sin(5 * t + k * 0.45);
      const x = 160 + r * Math.cos(t) * 1.6;
      const y = 140 + r * Math.sin(t) * 0.9;
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    parts.push(d + "Z");
  }
  return parts;
})();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgGuilloche(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "guilloche");
  svg.setAttribute("viewBox", "0 0 320 280");
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  svg.setAttribute("aria-hidden", "true");
  for (const d of GUILLOCHE_PATH) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "var(--ap-guilloche, #9DC3B8)");
    path.setAttribute("stroke-width", "0.6");
    svg.append(path);
  }
  return svg;
}

const MARK: Record<Check["status"], string> = { pass: "✓", fail: "✕", warn: "!", info: "i" };

function checkItem(check: Check): HTMLLIElement {
  const li = el("li", check.status);
  li.append(el("span", "mark", MARK[check.status]));
  const body = el("span");
  body.append(el("span", "t", check.title));
  body.append(el("span", "d", check.detail));
  li.append(body);
  return li;
}

export class AgentPassportCard extends HTMLElement {
  #report: PassportReport | null = null;
  #decide = false;
  #decision: "load" | "decline" | null = null;
  #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get report(): PassportReport | null {
    return this.#report;
  }
  set report(value: PassportReport | null) {
    this.#report = value;
    this.#decision = null;
    this.#render(true);
  }

  /** When true, unreviewed and changed reports show buttons and emit "passport-decision". */
  get decide(): boolean {
    return this.#decide;
  }
  set decide(value: boolean) {
    this.#decide = !!value;
    this.#render(false);
  }

  connectedCallback() {
    this.#render(false);
  }

  #render(pressStamp: boolean) {
    const root = this.#root;
    root.replaceChildren();
    const style = document.createElement("style");
    style.textContent = STYLE;
    root.append(style);
    const report = this.#report;
    if (!report) return;

    const page = el("article", "page");
    page.setAttribute("aria-label", `Agent Passport for ${report.networkName ?? report.input}: ${VERDICT_LABEL[report.verdict]}`);
    page.append(svgGuilloche());
    const content = el("div", "content");
    page.append(content);

    const head = el("div", "head");
    const id = el("div");
    id.append(el("p", "kicker", "Agent network"));
    const brand = report.network?.declared.brand;
    id.append(el("h3", undefined, brand || report.networkName || "Unknown network"));
    id.append(el("p", "origin", report.networkUrl ?? report.input));
    head.append(id);
    const stamp = el("div", `stamp ${report.verdict}${pressStamp ? " press" : ""}`, VERDICT_LABEL[report.verdict]);
    stamp.setAttribute("role", "img");
    stamp.setAttribute("aria-label", `Stamp: ${VERDICT_LABEL[report.verdict]}`);
    stamp.append(el("small", undefined, (report.checkedAt ?? "").slice(0, 10)));
    head.append(stamp);
    content.append(head);

    content.append(el("p", "summary", report.summary));
    content.append(el("p", "meaning", VERDICT_MEANING[report.verdict]));

    if (report.network) {
      const facts = el("dl", "facts");
      const add = (k: string, v: string) => {
        const d = el("div");
        d.append(el("dt", undefined, k), el("dd", undefined, v));
        facts.append(d);
      };
      add("Front agent", report.network.runtimeFrontMan ?? report.network.frontMan);
      add("Agents", String(report.network.agents.length));
      add("May contact", report.network.origins.length ? report.network.origins.join(", ") : "No other sites");
      add("Pinned review", report.pin.pin ? `${report.pin.pin.reviewedAt.slice(0, 10)}${report.pin.pin.reviewedBy ? ` by ${report.pin.pin.reviewedBy}` : ""}` : "None");
      content.append(facts);
    }

    // What failed first, then what changed, then the full check list by category.
    const failures = report.checks.filter((c) => c.status === "fail");
    if (failures.length) {
      const box = el("div");
      for (const f of failures) {
        const c = el("div", "change refused");
        c.append(el("strong", undefined, f.title));
        c.append(el("pre", undefined, f.detail));
        box.append(c);
      }
      content.append(box);
    }
    if (report.pin.changes.length) {
      const det = el("details");
      det.open = true;
      det.append(el("summary", undefined, `Changed since the pinned review (${report.pin.changes.length})`));
      const list = el("div");
      list.style.display = "grid";
      list.style.gap = "8px";
      list.style.marginTop = "8px";
      for (const ch of report.pin.changes) {
        const c = el("div", "change");
        c.append(el("strong", undefined, ch.detail));
        if (ch.after) c.append(el("pre", undefined, ch.after));
        list.append(c);
      }
      det.append(list);
      content.append(det);
    }
    for (const category of CATEGORY_ORDER) {
      const items = report.checks.filter((c) => c.category === category);
      if (!items.length) continue;
      const det = el("details");
      const failed = items.filter((c) => c.status === "fail").length;
      const warned = items.filter((c) => c.status === "warn").length;
      const tally = failed ? `, ${failed} failed` : warned ? `, ${warned} to note` : "";
      det.append(el("summary", undefined, `${CATEGORY_TITLE[category]} (${items.length}${tally})`));
      const ul = el("ul");
      for (const c of items) ul.append(checkItem(c));
      det.append(ul);
      content.append(det);
    }
    if (report.digest) {
      const det = el("details");
      det.append(el("summary", undefined, "Digests (SHA-256)"));
      const ul = el("ul");
      for (const [k, v] of Object.entries(report.digest)) {
        const li = el("li", "info");
        li.append(el("span", "mark", "#"));
        const b = el("span");
        b.append(el("span", "t", k), el("span", "d", v));
        li.append(b);
        ul.append(li);
      }
      det.append(ul);
      content.append(det);
    }

    if (this.#decide && (report.verdict === "unreviewed" || report.verdict === "changed")) {
      if (this.#decision) {
        content.append(el("p", "decided", this.#decision === "load" ? "You chose to load these agents." : "You chose not to load these agents."));
      } else {
        const actions = el("div", "actions");
        const load = el("button", "load", "Load these agents");
        const decline = el("button", "decline", "Don't load");
        load.type = "button";
        decline.type = "button";
        const choose = (decision: "load" | "decline") => {
          this.#decision = decision;
          this.dispatchEvent(new CustomEvent("passport-decision", { detail: { decision }, bubbles: true, composed: true }));
          this.#render(false);
        };
        load.addEventListener("click", () => choose("load"));
        decline.addEventListener("click", () => choose("decline"));
        actions.append(load, decline);
        content.append(actions);
      }
    }

    const [l1, l2] = machineReadableZone(report);
    const mrz = el("div", "mrz");
    mrz.setAttribute("aria-hidden", "true");
    mrz.append(el("div", undefined, l1), el("div", undefined, l2));
    content.append(mrz);

    root.append(page);
  }
}

export function defineAgentPassportCard(tagName = "agent-passport-card"): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(tagName)) customElements.define(tagName, AgentPassportCard);
}

defineAgentPassportCard();

declare global {
  interface HTMLElementTagNameMap {
    "agent-passport-card": AgentPassportCard;
  }
}
