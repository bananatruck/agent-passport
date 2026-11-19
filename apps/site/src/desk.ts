// Boots the agent runtime in the live demo and puts Agent Passport between the runtime
// and every partner network. Also publishes the read-only facade that site-actions.js
// exposes to the Trip Desk agent as website_get_partner_passports and website_open_passport.
import { installPassportGuard, type GuardHandle } from "agent-passport/guard";
import type { PassportReport } from "agent-passport";
import { loadPins, siteBase, loadPeers, type DemoPeers } from "./passport-bridge";

export interface ReportEventDetail {
  report: PassportReport;
  /** Set when the guard waits for the visitor's decision on this card. */
  decisionId?: string;
}

export interface DecisionEventDetail {
  decisionId: string;
  decision: "load" | "decline";
}

export interface OutcomeEventDetail {
  networkUrl: string;
  loaded: boolean;
}

declare global {
  interface WindowEventMap {
    "passport:report": CustomEvent<ReportEventDetail>;
    "passport:decision": CustomEvent<DecisionEventDetail>;
    "passport:outcome": CustomEvent<OutcomeEventDetail>;
    "passport:open": CustomEvent<{ networkName: string | null }>;
  }
  var tidewaterDesk:
    | {
        getPassports(): unknown;
        openPassport(partner: string | null): unknown;
      }
    | undefined;
}

interface RuntimeModule {
  boot(root: HTMLElement, opts: { originUrl: string; sandboxWorkerUrl: string }): Promise<{ engine: unknown }>;
  parseHocon(text: string): unknown;
}

let started: Promise<void> | null = null;
let guard: GuardHandle | null = null;
let peers: DemoPeers | null = null;
let decisionCounter = 0;

function askVisitor(report: PassportReport): Promise<boolean> {
  const decisionId = `decision-${++decisionCounter}`;
  return new Promise((resolve) => {
    const onDecision = (event: CustomEvent<DecisionEventDetail>) => {
      if (event.detail.decisionId !== decisionId) return;
      window.removeEventListener("passport:decision", onDecision);
      resolve(event.detail.decision === "load");
    };
    window.addEventListener("passport:decision", onDecision);
    window.dispatchEvent(new CustomEvent("passport:report", { detail: { report, decisionId } }));
  });
}

function partnerSummaries() {
  const list = peers?.partners ?? [];
  return {
    partners: list.map((partner) => {
      const report = guard?.reports.get(partner.url) ?? null;
      if (!report) return { partner: partner.id, label: partner.label, verdict: null, summary: "Not contacted yet in this visit." };
      return {
        partner: partner.id,
        label: partner.label,
        verdict: report.verdict,
        summary: report.summary,
        failedChecks: report.checks.filter((c) => c.status === "fail").map((c) => `${c.title}: ${c.detail}`),
        warnings: report.checks.filter((c) => c.status === "warn").map((c) => `${c.title}: ${c.detail}`),
        changesSinceReview: report.pin.changes.map((c) => c.detail),
        pinnedReview: report.pin.pin ? { reviewedAt: report.pin.pin.reviewedAt, reviewedBy: report.pin.pin.reviewedBy } : null,
      };
    }),
  };
}

function openPassport(partner: string | null) {
  const known = peers?.partners.map((p) => p.id) ?? [];
  if (partner && !known.includes(partner)) return { ok: false, reason: `Unknown partner ${partner}.` };
  const selector = partner ? `#passport-${CSS.escape(partner)}` : "[data-demo-passports] [id^='passport-']";
  if (!document.querySelector(selector)) {
    return { ok: false, reason: partner ? `No passport for ${partner} yet: that partner has not been contacted in this visit.` : "No passport yet: no partner has been contacted in this visit." };
  }
  window.dispatchEvent(new CustomEvent("passport:open", { detail: { networkName: partner } }));
  return { ok: true, shown: partner ?? "the most recent passport" };
}

/** Boot the runtime once into root. Safe to call more than once (React strict mode). */
export function startDesk(root: HTMLElement): Promise<void> {
  started ??= (async () => {
    peers = await loadPeers();
    globalThis.tidewaterDesk = { getPassports: partnerSummaries, openPassport };
    const runtime = (await import(/* @vite-ignore */ new URL("runtime/index.js", siteBase()).href)) as RuntimeModule;
    const booted = await runtime.boot(root, {
      originUrl: siteBase().replace(/\/$/, ""),
      sandboxWorkerUrl: new URL("runtime/sandbox-worker.js", siteBase()).href,
    });
    guard = installPassportGuard(booted.engine as Parameters<typeof installPassportGuard>[0], {
      pins: loadPins,
      parseHocon: runtime.parseHocon,
      onReport: (report) => {
        // Unreviewed and changed partners are announced by askVisitor and approveChanged instead.
        if (report.verdict === "verified" || report.verdict === "refused") {
          window.dispatchEvent(new CustomEvent("passport:report", { detail: { report } }));
        }
      },
      approveUnreviewed: (report) => askVisitor(report),
      // Changed partners stay held: only the site's publisher can review them again.
      approveChanged: async (report) => {
        window.dispatchEvent(new CustomEvent("passport:report", { detail: { report } }));
        return false;
      },
      onDecision: (report, loaded) => {
        window.dispatchEvent(new CustomEvent("passport:outcome", { detail: { networkUrl: report.networkUrl ?? report.input, loaded } }));
      },
    });
  })();
  return started;
}
