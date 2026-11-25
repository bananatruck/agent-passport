import React, { useId } from "react";
import type { Verdict } from "../../../../packages/passport/src/types";
import { cn } from "../lib/utils";

export function GuillochePattern({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full opacity-35",
        className,
      )}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id={`${id}-guilloche`}
          width="120"
          height="36"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 0 18 Q 30 2, 60 18 T 120 18"
            fill="none"
            stroke="var(--ap-guilloche)"
            strokeWidth="0.75"
          />
          <path
            d="M 0 18 Q 30 34, 60 18 T 120 18"
            fill="none"
            stroke="var(--ap-guilloche)"
            strokeWidth="0.75"
          />
          <path
            d="M 0 9 Q 30 25, 60 9 T 120 9"
            fill="none"
            stroke="var(--ap-guilloche)"
            strokeWidth="0.5"
            strokeDasharray="2 2"
          />
          <path
            d="M 0 27 Q 30 11, 60 27 T 120 27"
            fill="none"
            stroke="var(--ap-guilloche)"
            strokeWidth="0.5"
            strokeDasharray="2 2"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}-guilloche)`} />
    </svg>
  );
}

const VERDICT_META: Record<
  Verdict,
  { label: string; colorVar: string; subtext: string }
> = {
  verified: {
    label: "Verified",
    colorVar: "var(--ap-verified)",
    subtext: "Matches publisher pin",
  },
  unreviewed: {
    label: "Unreviewed",
    colorVar: "var(--ap-unreviewed)",
    subtext: "No pin on file",
  },
  changed: {
    label: "Changed",
    colorVar: "var(--ap-changed)",
    subtext: "Held before compile",
  },
  refused: {
    label: "Refused",
    colorVar: "var(--ap-refused)",
    subtext: "Check failed closed",
  },
};

export function VerdictStamp({
  verdict,
  date = "2026-11-17",
  animateOnce = false,
  className,
}: {
  verdict: Verdict;
  date?: string;
  animateOnce?: boolean;
  className?: string;
}) {
  const meta = VERDICT_META[verdict];
  return (
    <div
      aria-label={`Verdict stamp: ${meta.label}`}
      style={{
        borderColor: meta.colorVar,
        color: meta.colorVar,
      }}
      className={cn(
        "inline-flex flex-col items-start rounded-sm border-2 px-3 py-1.5 select-none",
        animateOnce ? "ap-rubber-stamp-once" : "-rotate-2",
        className,
      )}
    >
      <div
        style={{ borderColor: meta.colorVar }}
        className="w-full border-b pb-0.5 font-display text-xl leading-none font-extrabold tracking-wide"
      >
        {meta.label}
      </div>
      <div className="mt-1 flex w-full items-center justify-between gap-3 font-mono text-[11px] leading-none font-semibold">
        <span>{meta.subtext}</span>
        <span>{date}</span>
      </div>
    </div>
  );
}

export function buildMrzLines(params: {
  verdict: Verdict;
  partnerLabel: string;
  networkName: string;
  checkedDate: string;
  digestHex: string;
}): [string, string] {
  const clean = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "<")
      .replace(/^<+|<+$/g, "");
  const line1 = `P<WEB${clean(params.partnerLabel)}<<${clean(params.networkName)}`.padEnd(
    44,
    "<",
  ).slice(0, 44);
  const verdictTag = clean(params.verdict).padEnd(8, "<").slice(0, 8);
  const dateTag = params.checkedDate.replace(/[^0-9]/g, "").padEnd(8, "0").slice(0, 8);
  const hashSlice = params.digestHex.toUpperCase().replace(/[^A-F0-9]/g, "0").slice(0, 24);
  const line2 = `${verdictTag}${dateTag}${hashSlice}`.padEnd(44, "<").slice(0, 44);
  return [line1, line2];
}
