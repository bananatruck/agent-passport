// The live demo: boots the reference runtime with the Agent Passport guard and shows one
// passport per partner the trip desk contacts. Loaded lazily, after the hero.
import { useEffect, useRef, useState } from "react";
import { FileCheck2, KeyRound } from "lucide-react";
import type { PassportReport } from "agent-passport";
import { startDesk, type DecisionEventDetail, type OutcomeEventDetail, type ReportEventDetail } from "../desk";
import { HiddenTextPanel } from "../components/HiddenTextPanel";
import { PassportCardHost } from "../components/PassportCardHost";
import { BorderBeam } from "../components/ui/border-beam";
import { VERDICT_LABEL, verdictColor } from "./shared";

interface LiveEntry {
  key: string;
  report: PassportReport;
  decisionId?: string;
  outcome?: "loaded" | "held";
}

function answerDecision(decisionId: string, decision: "load" | "decline") {
  window.dispatchEvent(new CustomEvent<DecisionEventDetail>("passport:decision", { detail: { decisionId, decision } }));
}

export default function LiveDemo() {
  const deskRootRef = useRef<HTMLDivElement | null>(null);
  const [deskError, setDeskError] = useState<string | null>(null);
  const [liveReports, setLiveReports] = useState<LiveEntry[]>([]);
  const [highlighted, setHighlighted] = useState<string | null>(null);

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

  const newestLiveReport = liveReports[0]?.report;
  const livePassportAnnouncement = newestLiveReport
    ? `${newestLiveReport.network?.declared.brand ?? newestLiveReport.networkName ?? "Partner"}: ${VERDICT_LABEL[newestLiveReport.verdict]}. ${newestLiveReport.summary}`
    : "";

  // Live Demo Section
  return (
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
  );
}
