// The page's access to Agent Passport for the Inspector, plus the demo's partner list.
import { inspectPeer, parsePinFile, type PassportReport, type PinFile, type Verdict } from "agent-passport";

export interface DemoPeer {
  id: string;
  label: string;
  url: string;
  expected: Verdict;
  note?: string;
}

export interface DemoPeers {
  environment: "pages" | "local";
  partners: DemoPeer[];
  /** Server-only hazard fixtures; present only when served by scripts/serve.mjs. */
  hazards: DemoPeer[];
}

/** The folder this page is served from, with a trailing slash (works on GitHub Pages subpaths). */
export function siteBase(): string {
  return new URL("./", document.baseURI).href;
}

let pinsPromise: Promise<PinFile | null> | null = null;

/** The publisher's pins from passports.json, loaded once per page. A missing or invalid file means no pins. */
export function loadPins(): Promise<PinFile | null> {
  pinsPromise ??= (async () => {
    try {
      const response = await fetch(new URL("passports.json", siteBase()), { cache: "no-store" });
      if (!response.ok) return null;
      return parsePinFile(await response.text());
    } catch (error) {
      console.error("passports.json could not be read; every partner counts as unreviewed.", error);
      return null;
    }
  })();
  return pinsPromise;
}

let peersPromise: Promise<DemoPeers> | null = null;

export function loadPeers(): Promise<DemoPeers> {
  peersPromise ??= fetch(new URL("demo-peers.json", siteBase()), { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error(`demo-peers.json: HTTP ${response.status}`);
    return (await response.json()) as DemoPeers;
  });
  return peersPromise;
}

/**
 * Inspect a partner from the Inspector. Pressing Inspect is the visitor's request to contact
 * that partner's origin; any second origin (a definition hosted elsewhere) is asked separately.
 */
export async function inspect(url: string): Promise<PassportReport> {
  return inspectPeer(url.trim(), {
    pins: await loadPins(),
    confirmDestination: async ({ origin, purpose }) =>
      window.confirm(`This partner's files point to a second site, ${origin}, to ${purpose}. Contact ${origin} too?`),
  });
}
