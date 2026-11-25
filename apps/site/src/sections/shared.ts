import type { Verdict } from "agent-passport";

export const VERDICT_LABEL: Record<Verdict, string> = {
  verified: "Verified",
  unreviewed: "Unreviewed",
  changed: "Changed",
  refused: "Refused",
};

export function verdictColor(verdict: Verdict): string {
  return verdict === "verified"
    ? "var(--ap-verified)"
    : verdict === "changed"
      ? "var(--ap-changed)"
      : verdict === "refused"
        ? "var(--ap-refused)"
        : "var(--ap-unreviewed)";
}
