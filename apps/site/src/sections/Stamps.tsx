// "What a stamp means": the four verdicts and who stands behind each line. Loaded lazily.
import type { Verdict } from "agent-passport";
import { SpotlightCard } from "../components/ui/spotlight-card";
import { VerdictStamp } from "../components/GuillochePattern";

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
      'Fetches <site base>/agent-manifest.json, the network definition, and links.json over HTTPS (or loopback HTTP in local dev) with credentials: "omit", no referrer, cache bypassed, no redirects followed, streaming byte caps (256 KiB manifest, 1 MiB definition, 64 KiB links), and an 8-second timeout; enforces valid UTF-8 and strict JSON with no duplicate keys, max depth 64, and max 20,000 keys; verifies exact network name match, front_man equality with the runtime\'s derived front agent, unique trimmed agent names, tool references the runtime can classify with no two sharing a runtime tool name, class agents only with a declared coded_tools bundle (the bundle itself is fetched later by the runtime and not checked), REST toolbox agents only toward the partner's own origin, {token} replacement on instructions, no bidirectional controls or Unicode tag characters U+E0000 to U+E007F anywhere in the manifest or definition (decoding any hidden text), canonical SHA-256 digests of the effective content, and, in the runtime guard, that the runtime compiles exactly the verified bytes and its HOCON parser reads them as JSON does.',
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
      "Treats the peer's brand, description, llm_router and peer_policy as unverified claims (the brand and the policy are pinned so they cannot change unnoticed); who operates the domain is not verified as a legal identity.",
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

export default function Stamps() {
  // What a Stamp Means Section
  return (
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
  );
}
