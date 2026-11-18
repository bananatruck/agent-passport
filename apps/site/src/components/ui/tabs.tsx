/**
 * Source: https://ui.aceternity.com/registry/tabs.json (https://ui.aceternity.com/components/tabs)
 * Library: Aceternity UI
 * License: Aceternity License - free for personal and commercial end products, no redistribution as a component library or template (https://ui.aceternity.com/licence, https://ui.aceternity.com/pricing)
 */

import React, { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "../../lib/utils";

export type Tab = {
  title: string;
  value: string;
  content?: React.ReactNode;
};

export const Tabs = ({
  tabs: propTabs,
  containerClassName,
  activeTabClassName,
  tabClassName,
  contentClassName,
}: {
  tabs: Tab[];
  containerClassName?: string;
  activeTabClassName?: string;
  tabClassName?: string;
  contentClassName?: string;
}) => {
  const [active, setActive] = useState<Tab>(propTabs[0]);
  const [tabs, setTabs] = useState<Tab[]>(propTabs);
  const prefersReducedMotion = useReducedMotion();

  const moveSelectedTabToTop = (idx: number) => {
    const newTabs = [...propTabs];
    const selectedTab = newTabs.splice(idx, 1);
    newTabs.unshift(selectedTab[0]);
    setTabs(newTabs);
    setActive(newTabs[0]);
  };

  const [hovering, setHovering] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // WAI-ARIA tabs pattern: arrow keys, Home and End move between tabs and select them.
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const last = propTabs.length - 1;
    const next =
      event.key === "ArrowRight" ? (idx === last ? 0 : idx + 1)
      : event.key === "ArrowLeft" ? (idx === 0 ? last : idx - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    moveSelectedTabToTop(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="w-full">
      <div
        role="tablist"
        aria-label="Publisher integration files"
        className={cn(
          "relative flex w-full max-w-full flex-row flex-wrap items-center justify-start gap-2",
          containerClassName,
        )}
      >
        {propTabs.map((tab, idx) => {
          const isSelected = active.value === tab.value;
          return (
            <button
              key={tab.value}
              ref={(node) => {
                tabRefs.current[idx] = node;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.value}`}
              aria-selected={isSelected}
              aria-controls={`tabpanel-${tab.value}`}
              tabIndex={isSelected ? 0 : -1}
              onKeyDown={(event) => onTabKeyDown(event, idx)}
              onClick={() => {
                moveSelectedTabToTop(idx);
              }}
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
              className={cn(
                "relative rounded-md border border-(--ap-guilloche) px-3.5 py-2 text-sm font-semibold transition-colors",
                isSelected
                  ? "text-[#E9F1EE]"
                  : "bg-(--ap-paper) text-(--ap-text) hover:border-(--ap-ink)",
                tabClassName,
              )}
            >
              {isSelected && (
                <motion.div
                  layoutId="publisher-active-tab"
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : { type: "spring", bounce: 0.2, duration: 0.45 }
                  }
                  className={cn(
                    "absolute inset-0 rounded-md bg-(--ap-ink)",
                    activeTabClassName,
                  )}
                />
              )}

              <span className="relative z-10 block">{tab.title}</span>
            </button>
          );
        })}
      </div>
      <FadeInDiv
        tabs={tabs}
        active={active}
        key={active.value}
        hovering={hovering}
        prefersReducedMotion={Boolean(prefersReducedMotion)}
        className={cn("mt-4", contentClassName)}
      />
    </div>
  );
};

export const FadeInDiv = ({
  className,
  tabs,
  active,
  prefersReducedMotion = false,
}: {
  className?: string;
  key?: string;
  tabs: Tab[];
  active: Tab;
  hovering?: boolean;
  prefersReducedMotion?: boolean;
}) => {
  return (
    <div className={cn("relative w-full", className)}>
      {tabs.map((tab) => {
        const selected = tab.value === active.value;
        if (!selected) return null;
        return (
          <motion.div
            key={tab.value}
            role="tabpanel"
            id={`tabpanel-${tab.value}`}
            aria-labelledby={`tab-${tab.value}`}
            tabIndex={0}
            initial={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            className="w-full"
          >
            {tab.content}
          </motion.div>
        );
      })}
    </div>
  );
};
