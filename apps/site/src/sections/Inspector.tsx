// The Inspector: check any partner URL in the browser. Loaded lazily, after the hero.
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { PassportReport } from "agent-passport";
import { inspect, loadPeers, type DemoPeer } from "../passport-bridge";
import { HiddenTextPanel } from "../components/HiddenTextPanel";
import { PassportCardHost } from "../components/PassportCardHost";
import { BorderBeam } from "../components/ui/border-beam";
import { HoverBorderGradient } from "../components/ui/hover-border-gradient";
import { VERDICT_LABEL, verdictColor } from "./shared";

export default function Inspector() {
  const [peers, setPeers] = useState<DemoPeer[]>([]);
  const [hazards, setHazards] = useState<DemoPeer[]>([]);
  const [inspectorUrl, setInspectorUrl] = useState<string>("");
  const [inspectorLoading, setInspectorLoading] = useState<boolean>(false);
  const [inspectorReport, setInspectorReport] = useState<PassportReport | null>(null);
  const [inspectorError, setInspectorError] = useState<string | null>(null);
  // Only the latest inspection may update the result; an older one that finishes later is ignored.
  const latestRequest = useRef(0);

  useEffect(() => {
    loadPeers()
      .then((doc) => {
        setPeers(doc.partners);
        setHazards(doc.hazards ?? []);
        setInspectorUrl((current) => current || doc.partners[0]?.url || "");
      })
      .catch((error: unknown) => setInspectorError(error instanceof Error ? error.message : String(error)));
  }, []);

  const runInspection = async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) {
      setInspectorReport(null);
      setInspectorError("Enter a peer network URL to run an inspection.");
      return;
    }
    const request = ++latestRequest.current;
    setInspectorLoading(true);
    setInspectorError(null);
    setInspectorReport(null);
    try {
      const report = await inspect(trimmed);
      if (request === latestRequest.current) setInspectorReport(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (request === latestRequest.current) setInspectorError(message);
    } finally {
      if (request === latestRequest.current) setInspectorLoading(false);
    }
  };

  // Inspector Section
  return (
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
        <p role="status" aria-live="polite" className="sr-only">
          {inspectorLoading
            ? "Checking the partner."
            : inspectorReport
              ? `${inspectorReport.network?.declared.brand ?? inspectorReport.networkName ?? "Partner"}: ${VERDICT_LABEL[inspectorReport.verdict]}. ${inspectorReport.summary}`
              : ""}
        </p>
        <div
          aria-busy={inspectorLoading}
          className="relative mt-3 overflow-hidden rounded-lg border border-(--ap-guilloche) bg-(--ap-paper) p-4 sm:p-6"
        >
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
  );
}
