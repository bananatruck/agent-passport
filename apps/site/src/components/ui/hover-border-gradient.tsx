/**
 * Source: https://ui.aceternity.com/registry/hover-border-gradient.json (https://ui.aceternity.com/components/hover-border-gradient)
 * Library: Aceternity UI
 * License: Aceternity License - free for personal and commercial end products, no redistribution as a component library or template (https://ui.aceternity.com/licence, https://ui.aceternity.com/pricing)
 */

import React, { useState, useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "../../lib/utils";

type Direction = "TOP" | "LEFT" | "BOTTOM" | "RIGHT";

export function HoverBorderGradient({
  children,
  containerClassName,
  className,
  as: Tag = "button",
  duration = 1,
  clockwise = true,
  accentColor = "var(--ap-verified)",
  ...props
}: React.PropsWithChildren<
  {
    as?: React.ElementType;
    containerClassName?: string;
    className?: string;
    duration?: number;
    clockwise?: boolean;
    accentColor?: string;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>) {
  const [hovered, setHovered] = useState<boolean>(false);
  const [direction, setDirection] = useState<Direction>("TOP");
  const prefersReducedMotion = useReducedMotion();

  const rotateDirection = (currentDirection: Direction): Direction => {
    const directions: Direction[] = ["TOP", "LEFT", "BOTTOM", "RIGHT"];
    const currentIndex = directions.indexOf(currentDirection);
    const nextIndex = clockwise
      ? (currentIndex - 1 + directions.length) % directions.length
      : (currentIndex + 1) % directions.length;
    return directions[nextIndex];
  };

  const movingMap: Record<Direction, string> = {
    TOP: "radial-gradient(20.7% 50% at 50% 0%, var(--ap-guilloche) 0%, rgba(157, 195, 184, 0) 100%)",
    LEFT: "radial-gradient(16.6% 43.1% at 0% 50%, var(--ap-guilloche) 0%, rgba(157, 195, 184, 0) 100%)",
    BOTTOM:
      "radial-gradient(20.7% 50% at 50% 100%, var(--ap-guilloche) 0%, rgba(157, 195, 184, 0) 100%)",
    RIGHT:
      "radial-gradient(16.2% 41.2% at 100% 50%, var(--ap-guilloche) 0%, rgba(157, 195, 184, 0) 100%)",
  };

  const highlight = `radial-gradient(75% 181% at 50% 50%, ${accentColor} 0%, rgba(157, 195, 184, 0) 100%)`;

  useEffect(() => {
    if (!hovered && !prefersReducedMotion) {
      const interval = setInterval(() => {
        setDirection((prevState) => rotateDirection(prevState));
      }, duration * 1000);
      return () => clearInterval(interval);
    }
  }, [hovered, duration, clockwise, prefersReducedMotion]);

  return (
    <Tag
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative flex h-min w-fit flex-col flex-nowrap content-center items-center justify-center overflow-visible rounded-md border border-(--ap-guilloche) bg-(--ap-paper) p-px transition duration-300",
        containerClassName,
      )}
      {...props}
    >
      <div
        className={cn(
          "z-10 w-auto rounded-[inherit] bg-(--ap-paper) px-3.5 py-2 text-left text-sm font-medium text-(--ap-text)",
          className,
        )}
      >
        {children}
      </div>
      {!prefersReducedMotion && (
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 z-0 flex-none overflow-hidden rounded-[inherit]"
          style={{
            filter: "blur(1.5px)",
            position: "absolute",
            width: "100%",
            height: "100%",
          }}
          initial={{ background: movingMap[direction] }}
          animate={{
            background: hovered
              ? [movingMap[direction], highlight]
              : movingMap[direction],
          }}
          transition={{ ease: "linear", duration: duration ?? 1 }}
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-[1.5px] z-1 flex-none rounded-[5px] bg-(--ap-paper)"
      />
    </Tag>
  );
}
