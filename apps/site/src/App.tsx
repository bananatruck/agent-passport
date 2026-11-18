import React, { useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  Search,
  Terminal as TerminalIcon,
  FileCheck2,
  KeyRound,
  BookOpen,
} from "lucide-react";
import type { PassportReport, Verdict } from "agent-passport";
import { startDesk, type DecisionEventDetail, type OutcomeEventDetail, type ReportEventDetail } from "./desk";
import { inspect, loadPeers, type DemoPeer } from "./passport-bridge";
import recordedReports from "./recorded-reports.json";
import { HiddenTextPanel } from "./components/HiddenTextPanel";
import { CHECK_RUN, INSTALL_SNIPPET, PIN_FILE_EXCERPT } from "./publisher-snippets";
import { PassportCardHost } from "./components/PassportCardHost";
import { VerdictStamp } from "./components/GuillochePattern";
import { NetworkTopology } from "./components/NetworkTopology";
import { BorderBeam } from "./components/ui/border-beam";
import { ShineBorder } from "./components/ui/shine-border";
import { DotPattern } from "./components/ui/dot-pattern";
import {
  Terminal,
  TypingAnimation,
  AnimatedSpan,
} from "./components/ui/terminal";
import { SpotlightCard } from "./components/ui/spotlight-card";
import { Tabs, type Tab } from "./components/ui/tabs";
import { HoverBorderGradient } from "./components/ui/hover-border-gradient";
import { HeroPill } from "./components/ui/hero-pill";

/** Real reports recorded by scripts/record-reports.mjs; see that script for how. */
const RECORDED = recordedReports as unknown as { source: string; recordedAt: string; reports: Record<string, PassportReport> };

interface LiveEntry {
  key: string;
  report: PassportReport;
  decisionId?: string;
  outcome?: "loaded" | "held";
}

function verdictColor(verdict: Verdict): string {
  return verdict === "verified"
    ? "var(--ap-verified)"
    : verdict === "changed"
      ? "var(--ap-changed)"
      : verdict === "refused"
        ? "var(--ap-refused)"
        : "var(--ap-unreviewed)";
}

function answerDecision(decisionId: string, decision: "load" | "decline") {
  window.dispatchEvent(new CustomEvent<DecisionEventDetail>("passport:decision", { detail: { decisionId, decision } }));
}

const VERDICT_DEFINITIONS: readonly {
  verdict: Verdict;
  title: string;
  colorVar: string;
  body: string;
}[] = [
  {
    verdict: "verified",
    title: "Verified",
    colorVar: "var(--ap-verified)",
    body: "The network was fetched from the requested origin without redirects, no check failed (warnings may be listed), and the SHA-256 digests of its effective content match the ones the caller site's publisher pinned on the stated date.",
  },
  {
    verdict: "unreviewed",
    title: "Unreviewed",
    colorVar: "var(--ap-unreviewed)",
    body: "No check failed (warnings may be listed), but the caller site's publisher has not pinned it in passports.json, so the visitor sees the full passport page and decides whether to load it.",
  },
  {
    verdict: "changed",
    title: "Changed",
    colorVar: "var(--ap-changed)",
    body: "No check failed, but its effective content differs from the publisher's pin; the passport page lists what changed and the runtime guard holds the network by default.",
  },
  {
    verdict: "refused",
    title: "Refused",
    colorVar: "var(--ap-refused)",
    body: "A fetch, byte-size, timeout, UTF-8, strict JSON, structure, undeclared-code, or hidden-text check failed, so the network cannot load.",
  },
];

const BOUNDARY_ROWS = [
  {
    category: "Verified by Agent Passport (SPEC 4.2)",
    source: "Checked directly by Agent Passport before compilation",
    covered:
      'Fetches <site base>/agent-manifest.json, the network definition, and links.json over HTTPS (or loopback HTTP in local dev) with credentials: "omit", no referrer, cache bypassed, no redirects followed, streaming byte caps (256 KiB manifest, 1 MiB definition, 64 KiB links), and an 8-second timeout; enforces valid UTF-8 and strict JSON with no duplicate keys, max depth 64, and max 20,000 keys; verifies exact network name match, front_man equality with the runtime\'s derived front agent, unique trimmed agent names, tool references the runtime can classify, executable agents only with a declared coded_tools bundle (the bundle itself is fetched later by the runtime and not checked), {token} replacement on instructions, no bidirectional controls or Unicode tag characters U+E0000 to U+E007F anywhere in the manifest or definition (decoding any hidden text), canonical SHA-256 digests of the effective content, and, in the runtime guard, that the runtime compiles exactly the verified bytes and its HOCON parser reads them as JSON does.',
  },
  {
    category: "Enforced by the runtime (SPEC 4.3)",
    source: "Enforced by the vendored reference runtime, not checked by Agent Passport",
    covered:
      "Runs the peer on the caller's router and model, never sends the visitor's API key to the peer, enforces the caller's step limit, filters private context (sly_data) through the caller's allow rules, and checks allowed_peers on each hop.",
  },
  {
    category: "Declared by the publisher (SPEC 4.4)",
    source: "Stated in the peer's files, not verified",
    covered:
      "Displays the peer's brand, descriptions, llm_router, peer_policy, tags, and sample queries as unverified claims; domain operation is not verified as a legal identity.",
  },
  {
    category: "Signals, not proof (SPEC 4.5)",
    source: "Heuristic text warnings",
    covered:
      "Warns when instructions ask for passwords, API keys, card numbers, or one-time codes, tell the model to ignore earlier instructions or act without informing the visitor, are unusually long, or contain zero-width characters; an empty warning list does not prove instructions are benign.",
  },
  {
    category: "Out of scope (SPEC 4.6)",
    source: "Not checked",
    covered:
      "Cryptographic signatures (not part of MVP Profile 0.2), model behavior sandboxing or evaluation, external MCP servers' internal tool implementations, and protection against a malicious caller page that hosts the guard.",
  },
] as const;

export function App() {
  const deskRootRef = useRef<HTMLDivElement | null>(null);
  const [deskError, setDeskError] = useState<string | null>(null);
  const [liveReports, setLiveReports] = useState<LiveEntry[]>([]);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [peers, setPeers] = useState<DemoPeer[]>([]);
  const [hazards, setHazards] = useState<DemoPeer[]>([]);

  const [inspectorUrl, setInspectorUrl] = useState<string>("");
  const [inspectorLoading, setInspectorLoading] = useState<boolean>(false);
  const [inspectorReport, setInspectorReport] = useState<PassportReport | null>(null);
  const [inspectorError, setInspectorError] = useState<string | null>(null);

  useEffect(() => {
    loadPeers()
      .then((doc) => {
        setPeers(doc.partners);
        setHazards(doc.hazards ?? []);
        setInspectorUrl((current) => current || doc.partners[0]?.url || "");
      })
      .catch((error: unknown) => setInspectorError(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    if (!deskRootRef.current) return;
    startDesk(deskRootRef.current).catch((error: unknown) => {
      console.error("The trip desk could not start", error);
      setDeskError("The trip desk assistant could not start. The Inspector below still works.");
    });
  }, []);

  useEffect(() => {
    let counter = 0;
    const onReport = (event: CustomEvent<ReportEventDetail>) => {
      const { report, decisionId } = event.detail;
      setLiveReports((prev) => [{ key: `${report.checkedAt}-${++counter}`, report, decisionId }, ...prev]);
    };
    const onOutcome = (event: CustomEvent<OutcomeEventDetail>) => {
      const { networkUrl, loaded } = event.detail;
      setLiveReports((prev) => {
        const index = prev.findIndex((e) => (e.report.networkUrl ?? e.report.input) === networkUrl && !e.outcome);
        if (index < 0) return prev;
        const next = [...prev];
        next[index] = { ...next[index]!, outcome: loaded ? "loaded" : "held" };
        return next;
      });
    };
    const onOpen = (event: CustomEvent<{ networkName: string | null }>) => {
      const name = event.detail.networkName;
      const target = name ? document.getElementById(`passport-${name}`) : document.querySelector("[data-demo-passports] [id^='passport-']");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlighted(name ?? target?.id.replace(/^passport-/, "") ?? null);
      window.setTimeout(() => setHighlighted(null), 2400);
    };
    window.addEventListener("passport:report", onReport);
    window.addEventListener("passport:outcome", onOutcome);
    window.addEventListener("passport:open", onOpen);
    return () => {
      window.removeEventListener("passport:report", onReport);
      window.removeEventListener("passport:outcome", onOutcome);
      window.removeEventListener("passport:open", onOpen);
    };
  }, []);

  const runInspection = async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) {
      setInspectorReport(null);
      setInspectorError("Enter a peer network URL to run an inspection.");
      return;
    }
    setInspectorLoading(true);
    setInspectorError(null);
    setInspectorReport(null);
    try {
      const report = await inspect(trimmed);
      setInspectorReport(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setInspectorError(message);
    } finally {
      setInspectorLoading(false);
    }
  };

  const newestLiveReport = liveReports[0]?.report;
  const livePassportAnnouncement = newestLiveReport
    ? `${newestLiveReport.network?.declared.brand ?? newestLiveReport.networkName ?? "Partner"}: ${
        VERDICT_DEFINITIONS.find((d) => d.verdict === newestLiveReport.verdict)?.title ?? newestLiveReport.verdict
      }. ${newestLiveReport.summary}`
    : "";

  const publisherTabs: Tab[] = [
    {
      title: "Two-line install",
      value: "install",
      content: (
        <Terminal title="site.js, after the runtime boots" sequence={true}>
          {INSTALL_SNIPPET.map((line, i) => (
            <AnimatedSpan key={line} delay={i * 160} className="text-[#E9F1EE]">
              {line}
            </AnimatedSpan>
          ))}
        </Terminal>
      ),
    },
    {
      title: "passports.json",
      value: "pinfile",
      content: (
        <Terminal title="passports.json (this site's real pin file, first lines)" sequence={false}>
          <AnimatedSpan className="text-[#E9F1EE]">{PIN_FILE_EXCERPT}</AnimatedSpan>
        </Terminal>
      ),
    },
    {
      title: "CI check",
      value: "ci",
      content: (
        <Terminal title={CHECK_RUN.title} sequence={true}>
          <TypingAnimation duration={12}>{CHECK_RUN.command}</TypingAnimation>
          {CHECK_RUN.output.map((line, i) => (
            <AnimatedSpan
              key={`${i}-${line}`}
              delay={300 + i * 140}
              className={line.startsWith("verified") ? "text-[#56C288]" : line.startsWith("changed") ? "text-[#F0B45A]" : "text-[#E9F1EE]"}
            >
              {line}
            </AnimatedSpan>
          ))}
        </Terminal>
      ),
    },
  ];

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-(--ap-bg) text-(--ap-text)">
      {/* Header */}
      <header className="border-b border-(--ap-guilloche) bg-(--ap-paper)">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#top"
              className="font-display text-2xl font-bold tracking-tight text-(--ap-text) no-underline"
            >
              Tidewater Trip Desk
            </a>
            <HeroPill
              icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
              text="Agent Passport guard active"
            />
          </div>
          <nav
            aria-label="Primary navigation"
            className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm font-semibold"
          >
            <a
              href="#live-demo"
              className="text-(--ap-text) no-underline hover:underline"
            >
              Live demo
            </a>
            <a
              href="#inspector"
              className="text-(--ap-text) no-underline hover:underline"
            >
              Inspect a partner
            </a>
            <a
              href="#publishers"
              className="text-(--ap-text) no-underline hover:underline"
            >
              For site publishers
            </a>
            <a
              href="#stamps"
              className="text-(--ap-text) no-underline hover:underline"
            >
              What a stamp means
            </a>
          </nav>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Hero section */}
        <section
          aria-labelledby="hero-heading"
          className="grid grid-cols-1 items-start gap-8 border-b border-(--ap-guilloche) pb-12 lg:grid-cols-12"
        >
          <div className="flex flex-col gap-5 lg:col-span-6">
            <h1
              id="hero-heading"
              className="font-display text-4xl leading-[1.06] font-extrabold text-(--ap-text) sm:text-5xl"
            >
              Check every partner agent network before it runs in your browser.
            </h1>
            <p className="max-w-[65ch] text-base leading-relaxed text-(--ap-text)/90">
              Agent Passport fetches a linked partner network, checks its
              structure and hidden text against the Open Agentic Web MVP
              specification, and compares SHA-256 digests of what the model
              will read with the version the site publisher pinned.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#live-demo"
                className="inline-flex items-center justify-center rounded-md border-2 border-(--ap-ink) bg-(--ap-ink) px-4 py-2.5 text-sm font-semibold text-[#E9F1EE] no-underline transition-opacity hover:opacity-90"
              >
                Try the live demo
              </a>
              <a
                href="#inspector"
                className="inline-flex items-center justify-center rounded-md border-2 border-(--ap-ink) bg-(--ap-paper) px-4 py-2.5 text-sm font-semibold text-(--ap-text) no-underline transition-colors hover:bg-(--ap-guilloche)/25"
              >
                Inspect a partner
              </a>
            </div>

            <NetworkTopology />
          </div>

          {/* Hero passport: a real report recorded by scripts/record-reports.mjs */}
          <div className="relative lg:col-span-6">
            <div className="relative overflow-hidden rounded-lg border-2 border-(--ap-ink) bg-(--ap-paper) p-2 sm:p-3">
              <DotPattern width={20} height={20} cr={0.9} />
              <ShineBorder borderWidth={1.5} duration={16} shineColor="var(--ap-verified)" />
              <div className="relative z-10">
                <PassportCardHost report={RECORDED.reports.harbor_ferry} />
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-(--ap-text)/75">
              A real Agent Passport report for the Harbor Ferry partner, recorded on {RECORDED.recordedAt.slice(0, 10)}.
              Open any section to see every check.
            </p>
          </div>
        </section>

        {/* Live Demo Section */}
        <section
          id="live-demo"
          aria-labelledby="live-demo-heading"
          className="border-b border-(--ap-guilloche) py-12"
        >
          <div className="max-w-3xl">
            <h2
              id="live-demo-heading"
              className="font-display text-3xl font-bold text-(--ap-text)"
            >
              Tidewater Trip Desk live demo
            </h2>
            <p className="mt-2 text-base leading-relaxed text-(--ap-text)/90">
              Ask the trip desk assistant to plan a ferry crossing, a room
              booking, or a weekend deal, and watch Agent Passport check each
              linked partner before its agents can run.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-(--ap-guilloche) bg-(--ap-paper) p-4 text-xs sm:grid-cols-2">
            <div className="flex items-start gap-2.5">
              <FileCheck2
                className="mt-0.5 h-4 w-4 shrink-0 text-(--ap-verified)"
                aria-hidden="true"
              />
              <p className="leading-relaxed text-(--ap-text)">
                Without an API key, the assistant runs on the built-in
                browser://mock scripted demo model that calls each linked
                partner once so you can inspect all three verdicts offline.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <KeyRound
                className="mt-0.5 h-4 w-4 shrink-0 text-(--ap-unreviewed)"
                aria-hidden="true"
              />
              <p className="leading-relaxed text-(--ap-text)">
                Open the model configuration panel inside the trip desk runtime
                to enter a key for OpenRouter, Otari, or any OpenAI-compatible
                router that allows browser requests; your key is sent only to
                the router you choose, never to a partner network.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            {/* Trip Desk Assistant Runtime Panel */}
            <div className="flex min-w-0 flex-col rounded-lg border-2 border-(--ap-ink) bg-(--ap-paper) lg:col-span-7">
              <div className="flex items-center justify-between border-b border-(--ap-guilloche) bg-(--ap-ink) px-4 py-3 text-[#E9F1EE]">
                <h3 className="font-display text-xl font-bold">
                  Trip desk assistant
                </h3>
                <span className="text-xs text-[#9DC3B8]">Runs in this browser</span>
              </div>
              <div className="p-2 sm:p-3">
                <div id="agent-app" ref={deskRootRef} className="desk-runtime min-h-44" />
                {deskError && (
                  <p role="alert" className="mt-2 text-sm text-(--ap-refused)">
                    {deskError}
                  </p>
                )}
              </div>
            </div>

            {/* Partner passport stack: one live card per partner the desk contacted */}
            <div className="flex flex-col gap-4 lg:col-span-5" data-demo-passports>
              <div role="status" aria-live="polite" className="sr-only">
                {livePassportAnnouncement}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-2xl font-bold text-(--ap-text)">Partner passports</h3>
                <span className="rounded-sm border border-(--ap-guilloche) bg-(--ap-paper) px-2.5 py-1 text-xs text-(--ap-text)">
                  Checked this visit: {liveReports.length}
                </span>
              </div>
              {liveReports.length === 0 ? (
                <p className="rounded-md border border-dashed border-(--ap-guilloche) bg-(--ap-paper) p-4 text-sm leading-relaxed text-(--ap-text)/85">
                  No partner contacted yet. Ask the trip desk to plan a day on Gull Island. Each time it wants to contact a
                  partner, approve the request in the chat, and that partner&apos;s passport appears here.
                </p>
              ) : (
                liveReports.map((entry, index) => (
                  <div
                    key={entry.key}
                    id={`passport-${entry.report.networkName ?? index}`}
                    className={`relative flex flex-col gap-2 overflow-hidden rounded-lg transition-shadow ${
                      highlighted === entry.report.networkName ? "ring-4 ring-(--ap-unreviewed)/40" : ""
                    }`}
                  >
                    {index === 0 && (
                      <BorderBeam size={72} duration={7} colorFrom={verdictColor(entry.report.verdict)} colorTo="var(--ap-ink)" borderWidth={2} />
                    )}
                    <HiddenTextPanel report={entry.report} />
                    <PassportCardHost
                      report={entry.report}
                      decide={!!entry.decisionId}
                      onDecision={entry.decisionId ? (decision) => answerDecision(entry.decisionId!, decision) : undefined}
                    />
                    {entry.outcome && (
                      <p className="px-1 text-xs font-semibold text-(--ap-text)/80">
                        {entry.outcome === "loaded" ? "Loaded: its agents ran in this browser." : "Not loaded: its agents did not run."}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Inspector Section */}
        <section
          id="inspector"
          data-inspector
          aria-labelledby="inspector-heading"
          className="border-b border-(--ap-guilloche) py-12"
        >
          <div className="max-w-3xl">
            <h2
              id="inspector-heading"
              className="font-display text-3xl font-bold text-(--ap-text)"
            >
              Inspect a partner
            </h2>
            <p className="mt-2 text-base leading-relaxed text-(--ap-text)/90">
              Paste any partner network URL or pick a demo partner. Checking
              contacts that partner&apos;s site from your browser, sends no
              cookies or key, and loads none of its agents.
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runInspection(inspectorUrl);
            }}
            className="mt-6 rounded-lg border border-(--ap-guilloche) bg-(--ap-paper) p-4 sm:p-6"
          >
            <label
              htmlFor="peer-network-url"
              className="block text-sm font-semibold text-(--ap-text)"
            >
              Peer network URL
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                id="peer-network-url"
                type="url"
                value={inspectorUrl}
                onChange={(event) => setInspectorUrl(event.target.value)}
                placeholder="https://partner.example/agents/network_name"
                required
                className="min-w-0 flex-1 rounded-md border border-(--ap-guilloche) bg-(--ap-bg) px-3.5 py-2.5 font-mono text-sm text-(--ap-text)"
              />
              <button
                type="submit"
                disabled={inspectorLoading}
                className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-(--ap-ink) bg-(--ap-ink) px-5 py-2.5 text-sm font-semibold text-[#E9F1EE] disabled:opacity-60"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>
                  {inspectorLoading ? "Checking partner..." : "Check partner"}
                </span>
              </button>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-(--ap-text)/80">
                Load a demo partner
              </div>
              <div className="mt-2 flex flex-wrap gap-2.5">
                {[...peers, ...hazards].map((peer) => (
                  <HoverBorderGradient
                    key={peer.id}
                    type="button"
                    accentColor={verdictColor(peer.expected)}
                    onClick={() => {
                      setInspectorUrl(peer.url);
                      void runInspection(peer.url);
                    }}
                  >
                    <span>{peer.label}</span>
                  </HoverBorderGradient>
                ))}
              </div>
            </div>
          </form>

          {/* Inspection result area */}
          <div className="mt-6">
            <h3 className="font-display text-2xl font-bold text-(--ap-text)">
              Inspection result
            </h3>
            <div className="relative mt-3 overflow-hidden rounded-lg border border-(--ap-guilloche) bg-(--ap-paper) p-4 sm:p-6">
              {inspectorReport && (
                <BorderBeam
                  size={72}
                  duration={8}
                  colorFrom="var(--ap-verified)"
                  colorTo="var(--ap-unreviewed)"
                />
              )}

              {inspectorReport ? (
                <div className="relative z-10 flex flex-col gap-3">
                  <HiddenTextPanel report={inspectorReport} />
                  <PassportCardHost report={inspectorReport} />
                </div>
              ) : inspectorError ? (
                <div
                  role="alert"
                  className="rounded-md border-l-4 border-(--ap-refused) bg-(--ap-bg) p-4 text-sm text-(--ap-text)"
                >
                  <p className="font-semibold">
                    Could not complete the inspection: {inspectorError}.
                  </p>
                  <p className="mt-1 text-xs text-(--ap-text)/80">
                    A peer URL ends with the network name, for example
                    https://partner.example/agents/rooms.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-(--ap-text)/80">
                  Choose a demo partner or enter a peer network URL above to
                  view its passport page.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* For Site Publishers Section */}
        <section
          id="publishers"
          aria-labelledby="publishers-heading"
          className="border-b border-(--ap-guilloche) py-12"
        >
          <div className="max-w-3xl">
            <h2
              id="publishers-heading"
              className="font-display text-3xl font-bold text-(--ap-text)"
            >
              For site publishers
            </h2>
            <p className="mt-2 text-base leading-relaxed text-(--ap-text)/90">
              When your agent network links to a partner site, review the
              partner once, commit a passports.json pin file to your repository,
              install the two-line runtime guard, and run the CLI check in
              continuous integration.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
            <ol className="flex flex-col gap-4 lg:col-span-6">
              <li className="rounded-lg border border-(--ap-guilloche) bg-(--ap-paper) p-4">
                <h3 className="font-display text-xl font-bold text-(--ap-text)">
                  1. Pin the partner network you reviewed
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-(--ap-text)/90">
                  Run the CLI against a partner URL to inspect its manifest,
                  effective definition, and links.json entry, then write the
                  SHA-256 digests and structural snapshot to passports.json.
                </p>
              </li>
              <li className="rounded-lg border border-(--ap-guilloche) bg-(--ap-paper) p-4">
                <h3 className="font-display text-xl font-bold text-(--ap-text)">
                  2. Commit passports.json to your repository
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-(--ap-text)/90">
                  Ship passports.json alongside your site so every visitor&apos;s
                  browser compares SHA-256 digests of the live partner&apos;s
                  effective content with the ones you reviewed.
                </p>
              </li>
              <li className="rounded-lg border border-(--ap-guilloche) bg-(--ap-paper) p-4">
                <h3 className="font-display text-xl font-bold text-(--ap-text)">
                  3. Install the guard in two lines
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-(--ap-text)/90">
                  Wrap your reference runtime Engine instance with
                  installPassportGuard so changed or refused partners are held
                  before compilation and verified partners compile from the
                  already-checked bytes.
                </p>
              </li>
              <li className="rounded-lg border border-(--ap-guilloche) bg-(--ap-paper) p-4">
                <h3 className="font-display text-xl font-bold text-(--ap-text)">
                  4. Add the check to continuous integration
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-(--ap-text)/90">
                  Run agent-passport check in CI on a schedule or before
                  deployment; the command exits with code 0 when every pinned
                  partner matches and code 1 when any partner changed or failed
                  a check.
                </p>
              </li>
            </ol>

            <div className="flex flex-col gap-4 lg:col-span-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-(--ap-text)">
                <TerminalIcon className="h-4 w-4" aria-hidden="true" />
                <span>Publisher workflow snippets</span>
              </div>
              <Tabs tabs={publisherTabs} />
            </div>
          </div>
        </section>

        {/* What a Stamp Means Section */}
        <section
          id="stamps"
          aria-labelledby="stamps-heading"
          className="py-12"
        >
          <div className="max-w-3xl">
            <h2
              id="stamps-heading"
              className="font-display text-3xl font-bold text-(--ap-text)"
            >
              What a stamp means
            </h2>
            <p className="mt-2 text-base leading-relaxed text-(--ap-text)/90">
              Agent Passport never claims a partner network is harmless; each
              stamp reports the exact outcome of the structural checks and pin
              comparison.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {VERDICT_DEFINITIONS.map((item) => (
              <SpotlightCard
                key={item.verdict}
                spotlightColor={item.colorVar}
                className="border border-(--ap-guilloche)"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-2xl font-bold text-(--ap-text)">
                    {item.title}
                  </h3>
                  <VerdictStamp verdict={item.verdict} date="SPEC 4.1" />
                </div>
                <p className="mt-3 text-sm leading-relaxed text-(--ap-text)">
                  {item.body}
                </p>
              </SpotlightCard>
            ))}
          </div>

          {/* Five categories verification boundary table */}
          <div className="mt-8 overflow-x-auto rounded-lg border border-(--ap-guilloche) bg-(--ap-paper)">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-(--ap-guilloche) bg-(--ap-ink) text-[#E9F1EE]">
                  <th scope="col" className="px-4 py-3 font-display text-lg font-bold">
                    Category
                  </th>
                  <th scope="col" className="px-4 py-3 font-display text-lg font-bold">
                    Source of truth
                  </th>
                  <th scope="col" className="px-4 py-3 font-display text-lg font-bold">
                    What is covered
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--ap-guilloche)">
                {BOUNDARY_ROWS.map((row) => (
                  <tr key={row.category} className="align-top">
                    <th
                      scope="row"
                      className="px-4 py-3.5 font-semibold text-(--ap-text) sm:w-56"
                    >
                      {row.category}
                    </th>
                    <td className="px-4 py-3.5 text-(--ap-text)/85 sm:w-64">
                      {row.source}
                    </td>
                    <td className="px-4 py-3.5 leading-relaxed text-(--ap-text)">
                      {row.covered}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-(--ap-guilloche) bg-(--ap-paper) py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-xs text-(--ap-text)/85 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              MIT for this project&apos;s own code. Some UI component files
              keep their own licenses (see docs/CREDITS.md), and the vendored
              reference runtime is Apache 2.0.
            </p>
            <p className="font-semibold">
              Built on the Worldwide Agentic Web MVP Profile 0.2 reference
              runtime.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5 font-semibold">
            {[
              ["Source code", "https://github.com/bananatruck/agent-passport"],
              ["Build spec and threat model", "https://github.com/bananatruck/agent-passport/blob/main/docs/SPEC.md"],
              ["UI component credits", "https://github.com/bananatruck/agent-passport/blob/main/docs/CREDITS.md"],
              ["The Open Agentic Web spec", "https://github.com/cognizant-ai-labs/agentic-web/blob/main/docs/worldwide_agentic_web_mvp_spec.md"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-(--ap-text) hover:underline"
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{label}</span>
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
