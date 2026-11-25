// "For site publishers": install, pin file and CI check, all real content. Loaded lazily.
import { Terminal as TerminalIcon } from "lucide-react";
import { Tabs, type Tab } from "../components/ui/tabs";
import { Terminal, TypingAnimation, AnimatedSpan } from "../components/ui/terminal";
import { CHECK_RUN, INSTALL_SNIPPET, PIN_FILE_EXCERPT } from "../publisher-snippets";

export default function Publishers() {
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

  // For Site Publishers Section
  return (
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
  );
}
