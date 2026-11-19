/**
 * Source: https://magicui.design/r/dot-pattern.json (https://magicui.design/docs/components/dot-pattern)
 * Library: Magic UI
 * License: MIT License (https://github.com/magicuidesign/magicui/blob/main/LICENSE.md)
 * Copyright (c) Magic UI. The full license text, including its permission notice, ships with the site in public/third-party-notices.txt.
 */

import React, { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "../../lib/utils";

export interface DotPatternProps extends React.SVGProps<SVGSVGElement> {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  cx?: number;
  cy?: number;
  cr?: number;
  className?: string;
  glow?: boolean;
}

function Dot({
  cx,
  cy,
  r,
  glow,
  gradientId,
}: {
  cx: number;
  cy: number;
  r: number;
  glow: boolean;
  gradientId: string;
}) {
  const reduceMotion = useReducedMotion();
  const animateGlow = glow && !reduceMotion;
  const [timing] = useState(() => ({
    delay: Math.random() * 5,
    duration: Math.random() * 3 + 2,
  }));

  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      fill={glow ? `url(#${gradientId})` : "currentColor"}
      initial={animateGlow ? { opacity: 0.4, scale: 1 } : {}}
      animate={
        animateGlow
          ? {
              opacity: [0.4, 1, 0.4],
              scale: [1, 1.5, 1],
            }
          : {}
      }
      transition={
        animateGlow
          ? {
              duration: timing.duration,
              repeat: Infinity,
              repeatType: "reverse",
              delay: timing.delay,
              ease: "easeInOut",
            }
          : {}
      }
    />
  );
}

export function DotPattern({
  width = 18,
  height = 18,
  x = 0,
  y = 0,
  cx = 1,
  cy = 1,
  cr = 1,
  className,
  glow = false,
  ...props
}: DotPatternProps) {
  const id = useId();
  const containerRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    // The hero card can grow after a late font swap without the window resizing.
    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const stepX = Number.isFinite(width) && width > 0 ? width : 18;
  const stepY = Number.isFinite(height) && height > 0 ? height : 18;
  const cols = Math.max(1, Math.ceil(dimensions.width / stepX));
  const rows = Math.max(1, Math.ceil(dimensions.height / stepY));
  const dots = Array.from({ length: cols * rows }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      x: col * stepX + cx + x,
      y: row * stepY + cy + y,
    };
  });

  return (
    <svg
      ref={containerRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full text-(--ap-guilloche)/45",
        className,
      )}
      {...props}
    >
      <defs>
        <radialGradient id={`${id}-gradient`}>
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      {dots.map((dot) => (
        <Dot
          key={`${dot.x}-${dot.y}`}
          cx={dot.x}
          cy={dot.y}
          r={cr}
          glow={glow}
          gradientId={`${id}-gradient`}
        />
      ))}
    </svg>
  );
}
