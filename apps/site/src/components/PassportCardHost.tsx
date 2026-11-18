import React, { useEffect, useRef } from "react";
import type { PassportReport } from "../../../../packages/passport/src/types";

export interface AgentPassportCardElement extends HTMLElement {
  report?: PassportReport | null;
}

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "agent-passport-card": React.DetailedHTMLProps<
        React.HTMLAttributes<AgentPassportCardElement>,
        AgentPassportCardElement
      >;
    }
  }
}

export interface PassportCardHostProps {
  report: PassportReport;
  className?: string;
}

export function PassportCardHost({ report, className }: PassportCardHostProps) {
  const ref = useRef<AgentPassportCardElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.report = report;
    }
  }, [report]);

  return <agent-passport-card ref={ref} className={className} />;
}
