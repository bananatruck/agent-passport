import React, { useEffect, useRef } from "react";
import "agent-passport/card";
import type { AgentPassportCard } from "agent-passport/card";
import type { PassportReport } from "agent-passport";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "agent-passport-card": React.DetailedHTMLProps<React.HTMLAttributes<AgentPassportCard>, AgentPassportCard>;
    }
  }
}

export interface PassportCardHostProps {
  report: PassportReport;
  /** Show "Load these agents" and "Don't load" for unreviewed and changed reports. */
  decide?: boolean;
  onDecision?: (decision: "load" | "decline") => void;
  className?: string;
}

/** Renders the library's <agent-passport-card> custom element for one report. */
export function PassportCardHost({ report, decide = false, onDecision, className }: PassportCardHostProps) {
  const ref = useRef<AgentPassportCard | null>(null);

  // Separate effects: a new report resets the card's recorded decision, but showing or hiding
  // the decision buttons must not.
  useEffect(() => {
    if (ref.current) ref.current.report = report;
  }, [report]);
  useEffect(() => {
    if (ref.current) ref.current.decide = decide;
  }, [decide]);

  useEffect(() => {
    const card = ref.current;
    if (!card || !onDecision) return;
    const listener = (event: Event) => onDecision((event as CustomEvent<{ decision: "load" | "decline" }>).detail.decision);
    card.addEventListener("passport-decision", listener);
    return () => card.removeEventListener("passport-decision", listener);
  }, [onDecision]);

  return <agent-passport-card ref={ref} className={className} />;
}
