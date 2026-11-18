import { isObject } from "./json.js";
import type { AgentSummary, Check } from "./types.js";

/** Inspect all string data and keys, including unused replacement definitions. */
export function hiddenTextChecks(value: unknown, location: string): Check[] {
  const checks: Check[] = [];
  const visit = (value: unknown, path: string) => {
    if (typeof value === "string") {
      const tags = [...value].filter(c => { const cp = c.codePointAt(0) ?? 0; return cp >= 0xE0000 && cp <= 0xE007F; });
      const bidi = /[\u202A-\u202E\u2066-\u2069]/u.test(value);
      if (tags.length || bidi) {
        const decoded = tags.map(c => String.fromCharCode((c.codePointAt(0) ?? 0) - 0xE0000)).join("");
        checks.push({ id: `hidden.${path}`, status: "fail", category: "verified", code: "HIDDEN_TEXT", title: "Hidden text refused", detail: `${path} contains ${bidi ? "bidirectional controls" : "Unicode tags"}${tags.length ? `; decoded hidden ASCII: ${JSON.stringify(decoded)}` : ""}.`, ...(decoded ? { evidence: decoded } : {}) });
      }
      if (/[\u200B-\u200D\u2060\uFEFF]/u.test(value)) checks.push({ id: `signal.zero-width.${path}`, status: "warn", category: "signal", title: "Zero-width characters", detail: `${path} contains zero-width characters. This is a signal, not proof of harmful instructions.` });
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => {
        const name = isObject(v) && typeof v.name === "string" ? ` agent ${JSON.stringify(v.name)}` : "";
        visit(v, `${path}[${i}]${name}`);
      });
    } else if (isObject(value)) {
      for (const [key, v] of Object.entries(value)) {
        visit(key, `${path} key ${JSON.stringify(key)}`);
        visit(v, `${path}.${key}`);
      }
    }
  };
  visit(value, location);
  return checks;
}

export function instructionSignals(agents: AgentSummary[]): Check[] {
  const checks: Check[] = [];
  const patterns: [string, string, RegExp][] = [
    ["secrets", "Sensitive information request", /\b(?:passwords?|api[\s_-]*keys?|(?:credit[\s-]*|debit[\s-]*)?card[\s-]*(?:numbers?|details)|cvv|one[\s-]*time[\s-]*(?:codes?|passwords?)|seed[\s-]*phrases?)\b/i],
    ["ignore", "Earlier instructions overridden", /\bignore\s+(?:(?:all|any|previous|prior|earlier)\s+)+instructions\b/i],
    ["conceal", "Concealed action requested", /\b(?:without telling|do not tell|don't tell|secretly)\b/i],
  ];
  // A sentence that forbids asking for secrets ("Never ask for passwords") is not a request for them.
  const negated = /\b(?:never|not|don't|do not|no|without)\b/i;
  for (const agent of agents) {
    const sentences = agent.instructions.split(/(?<=[.!?])\s+|\n+/).map(s => s.replace(/^[\s\-*]+/, "").trim()).filter(Boolean);
    for (const [id, title, pattern] of patterns) {
      const hit = sentences.find(s => pattern.test(s) && !(id === "secrets" && negated.test(s)));
      if (!hit) continue;
      const quote = hit.length > 160 ? `${hit.slice(0, 157)}...` : hit;
      checks.push({ id: `signal.${id}.${agent.name}`, status: "warn", category: "signal", title, detail: `${JSON.stringify(agent.name)} says: "${quote}" This is a signal, not proof of harmful behaviour.`, evidence: hit });
    }
    if (agent.instructions.length > 20000) checks.push({ id: `signal.length.${agent.name}`, status: "warn", category: "signal", title: "Unusually long instructions", detail: `${agent.name} has ${agent.instructions.length} instruction characters. This is a signal, not proof of harmful behaviour.` });
  }
  return checks;
}

/**
 * Merge HIDDEN_TEXT failures that carry the same hidden payload into one check listing every
 * place it was found (the raw replacement string and each agent it was substituted into).
 * Other checks pass through unchanged and keep their order.
 */
export function mergeHiddenText(checks: Check[]): Check[] {
  const groups = new Map<string, { locations: string[]; evidence?: string; bidi: boolean }>();
  const out: (Check | string)[] = [];
  for (const check of checks) {
    if (check.code !== "HIDDEN_TEXT") { out.push(check); continue; }
    const key = check.evidence ?? "\u0000bidi";
    let group = groups.get(key);
    if (!group) {
      group = { locations: [], bidi: false, ...(check.evidence ? { evidence: check.evidence } : {}) };
      groups.set(key, group);
      out.push(key);
    }
    group.locations.push(check.detail.split(" contains ")[0] ?? check.detail);
    if (check.detail.includes("bidirectional")) group.bidi = true;
  }
  let n = 0;
  return out.map((item) => {
    if (typeof item !== "string") return item;
    const g = groups.get(item)!;
    const where = `Found in ${g.locations.length} place${g.locations.length === 1 ? "" : "s"}: ${g.locations.join("; ")}.`;
    const what = g.evidence
      ? ` Decoded hidden text, which people cannot see but a model reads: "${g.evidence}".`
      : "";
    const bidi = g.bidi ? " Contains bidirectional control characters, which change the order people see text in." : "";
    return {
      id: `hidden.${n++}`,
      status: "fail",
      category: "verified",
      code: "HIDDEN_TEXT",
      title: g.evidence ? "Hidden text refused" : "Bidirectional controls refused",
      detail: `${where}${what}${bidi}`,
      ...(g.evidence ? { evidence: g.evidence } : {}),
    } satisfies Check;
  });
}
