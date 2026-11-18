import { lazy, Suspense } from "react";
import { ShieldCheck, BookOpen } from "lucide-react";
import type { PassportReport } from "agent-passport";
import recordedReports from "./recorded-reports.json";
import { PassportCardHost } from "./components/PassportCardHost";
import { HeroPill } from "./components/ui/hero-pill";

// Everything below the hero, and the hero's animated decorations, load after first paint.
// They carry Motion, the checker and the runtime guard, which the first screen does not need.
const LiveDemo = lazy(() => import("./sections/LiveDemo"));
const Inspector = lazy(() => import("./sections/Inspector"));
const Publishers = lazy(() => import("./sections/Publishers"));
const Stamps = lazy(() => import("./sections/Stamps"));
const NetworkTopology = lazy(() => import("./components/NetworkTopology").then((m) => ({ default: m.NetworkTopology })));
const HeroDecor = lazy(() => import("./sections/HeroDecor"));

function SectionFallback({ label }: { label: string }) {
  return <p className="py-12 text-sm text-(--ap-text)/70">Loading {label}...</p>;
}

/** Real reports recorded by scripts/record-reports.mjs; see that script for how. */
const RECORDED = recordedReports as unknown as { source: string; recordedAt: string; reports: Record<string, PassportReport> };

export function App() {
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
              Review a partner's agents once. Every visitor's browser holds them to it.
            </h1>
            <p className="max-w-[65ch] text-base leading-relaxed text-(--ap-text)/90">
              A site&apos;s publisher pins the exact version of a partner&apos;s
              agent network they reviewed. Before those agents run, Agent
              Passport checks the live partner against the Open Agentic Web
              spec and against that pin, in every visitor&apos;s browser, and
              holds anything that changed or hides instructions.
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

            <Suspense fallback={<div className="h-[230px] rounded-lg border border-(--ap-guilloche) bg-(--ap-paper)" aria-hidden="true" />}>
              <NetworkTopology />
            </Suspense>
          </div>

          {/* Hero passport: a real report recorded by scripts/record-reports.mjs */}
          <div className="relative lg:col-span-6">
            <div className="relative overflow-hidden rounded-lg border-2 border-(--ap-ink) bg-(--ap-paper) p-2 sm:p-3">
              <Suspense fallback={null}>
                <HeroDecor />
              </Suspense>
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

        <Suspense fallback={<SectionFallback label="the live demo" />}>
          <LiveDemo />
        </Suspense>
        <Suspense fallback={<SectionFallback label="the Inspector" />}>
          <Inspector />
        </Suspense>
        <Suspense fallback={<SectionFallback label="the publisher tools" />}>
          <Publishers />
        </Suspense>
        <Suspense fallback={<SectionFallback label="the stamp guide" />}>
          <Stamps />
        </Suspense>
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
