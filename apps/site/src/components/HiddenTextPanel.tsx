import { OctagonX } from "lucide-react";
import type { PassportReport } from "agent-passport";
import { useReducedMotion } from "motion/react";
import DecryptedText from "./ui/decrypted-text";

/** Longer evidence is shown as plain text: the reveal animation does work per character on every tick. */
const ANIMATE_UP_TO = 240;

/**
 * Shows text a partner hid in invisible Unicode tag characters, decoded by Agent Passport.
 * The text comes from the report's HIDDEN_TEXT checks; nothing here is invented.
 */
export function HiddenTextPanel({ report }: { report: PassportReport }) {
  const reduceMotion = useReducedMotion();
  const decoded = [...new Set(report.checks.filter((c) => c.code === "HIDDEN_TEXT" && c.evidence).map((c) => c.evidence!))];
  if (!decoded.length) return null;
  return (
    <div className="rounded-md border-l-4 border-(--ap-refused) bg-(--ap-paper) p-3" role="note">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-(--ap-refused)">
        <OctagonX className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Hidden text decoded: invisible to people, readable by a model</span>
      </div>
      {decoded.map((text) => (
        <p key={text} className="mt-2 font-mono text-xs leading-relaxed break-words text-(--ap-text)">
          {reduceMotion || text.length > ANIMATE_UP_TO ? (
            text
          ) : (
            <DecryptedText text={text} animateOn="view" speed={22} maxIterations={6} sequential={true} />
          )}
        </p>
      ))}
    </div>
  );
}
