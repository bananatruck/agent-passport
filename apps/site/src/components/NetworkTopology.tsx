import React, { useRef } from "react";
import { Ship, BedDouble, Tag, ShieldCheck } from "lucide-react";
import { AnimatedBeam } from "./ui/animated-beam";

export function NetworkTopology() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const callerRef = useRef<HTMLDivElement | null>(null);
  const ferryRef = useRef<HTMLDivElement | null>(null);
  const roomsRef = useRef<HTMLDivElement | null>(null);
  const dealsRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="rounded-lg border border-(--ap-guilloche) bg-(--ap-paper) p-4">
      <div
        ref={containerRef}
        className="relative flex w-full items-center justify-between gap-4 py-3"
      >
        <div className="z-10 flex flex-col items-start">
          <div
            ref={callerRef}
            className="flex items-center gap-2.5 rounded-md border-2 border-(--ap-ink) bg-(--ap-bg) px-3 py-2.5 shadow-2xs"
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-(--ap-verified)" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-(--ap-text)">
                Tidewater Trip Desk
              </div>
              <div className="font-mono text-[11px] text-(--ap-text)/75">
                trip_desk
              </div>
            </div>
          </div>
        </div>

        <div className="z-10 flex flex-col gap-2.5">
          <div
            ref={ferryRef}
            className="flex items-center justify-between gap-2.5 rounded-md border border-(--ap-verified) bg-(--ap-bg) px-2.5 py-1.5"
          >
            <div className="flex items-center gap-2">
              <Ship className="h-3.5 w-3.5 shrink-0 text-(--ap-verified)" aria-hidden="true" />
              <span className="text-xs font-semibold text-(--ap-text)">
                Harbor Ferry
              </span>
            </div>
            <span className="rounded-xs border border-(--ap-verified) px-1.5 py-0.5 font-mono text-[10px] font-semibold text-(--ap-verified)">
              Verified
            </span>
          </div>

          <div
            ref={roomsRef}
            className="flex items-center justify-between gap-2.5 rounded-md border border-(--ap-changed) bg-(--ap-bg) px-2.5 py-1.5"
          >
            <div className="flex items-center gap-2">
              <BedDouble className="h-3.5 w-3.5 shrink-0 text-(--ap-changed)" aria-hidden="true" />
              <span className="text-xs font-semibold text-(--ap-text)">
                Tidewhistle Rooms
              </span>
            </div>
            <span className="rounded-xs border border-(--ap-changed) px-1.5 py-0.5 font-mono text-[10px] font-semibold text-(--ap-changed)">
              Changed
            </span>
          </div>

          <div
            ref={dealsRef}
            className="flex items-center justify-between gap-2.5 rounded-md border border-(--ap-refused) bg-(--ap-bg) px-2.5 py-1.5"
          >
            <div className="flex items-center gap-2">
              <Tag className="h-3.5 w-3.5 shrink-0 text-(--ap-refused)" aria-hidden="true" />
              <span className="text-xs font-semibold text-(--ap-text)">
                Gull Deals
              </span>
            </div>
            <span className="rounded-xs border border-(--ap-refused) px-1.5 py-0.5 font-mono text-[10px] font-semibold text-(--ap-refused)">
              Refused
            </span>
          </div>
        </div>

        <AnimatedBeam
          containerRef={containerRef}
          fromRef={callerRef}
          toRef={ferryRef}
          curvature={24}
          gradientStartColor="var(--ap-ink)"
          gradientStopColor="var(--ap-verified)"
          duration={4.5}
        />
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={callerRef}
          toRef={roomsRef}
          curvature={0}
          gradientStartColor="var(--ap-ink)"
          gradientStopColor="var(--ap-changed)"
          duration={5.2}
          delay={0.4}
        />
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={callerRef}
          toRef={dealsRef}
          curvature={-24}
          gradientStartColor="var(--ap-ink)"
          gradientStopColor="var(--ap-refused)"
          duration={5.8}
          delay={0.8}
        />
      </div>
      <p className="mt-2 border-t border-(--ap-guilloche)/60 pt-2 text-xs text-(--ap-text)/80">
        Tidewater Trip Desk links to three partner networks and checks each one before any partner agent runs.
      </p>
    </div>
  );
}
