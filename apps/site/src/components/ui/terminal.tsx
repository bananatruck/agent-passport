/**
 * Source: https://magicui.design/r/terminal.json (https://magicui.design/docs/components/terminal)
 * Library: Magic UI
 * License: MIT License (https://github.com/magicuidesign/magicui/blob/main/LICENSE.md)
 */

import React, {
  Children,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type RefAttributes,
} from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  type DOMMotionComponents,
  type HTMLMotionProps,
  type MotionProps,
} from "motion/react";

import { cn } from "../../lib/utils";

interface SequenceContextValue {
  completeItem: (index: number) => void;
  activeIndex: number;
  sequenceStarted: boolean;
}

const SequenceContext = createContext<SequenceContextValue | null>(null);
const useSequence = () => useContext(SequenceContext);

const ItemIndexContext = createContext<number | null>(null);
const useItemIndex = () => useContext(ItemIndexContext);

const motionElements = {
  article: motion.article,
  div: motion.div,
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  h4: motion.h4,
  h5: motion.h5,
  h6: motion.h6,
  li: motion.li,
  p: motion.p,
  section: motion.section,
  span: motion.span,
} as const;

type MotionElementType = Extract<
  keyof DOMMotionComponents,
  keyof typeof motionElements
>;
type TerminalTypingMotionComponent = ComponentType<
  Omit<HTMLMotionProps<"span">, "ref"> & RefAttributes<HTMLElement>
>;

export interface AnimatedSpanProps extends MotionProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  startOnView?: boolean;
}

export const AnimatedSpan = ({
  children,
  delay = 0,
  className,
  startOnView = false,
  ...props
}: AnimatedSpanProps) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const isInView = useInView(elementRef as React.RefObject<Element>, {
    amount: 0.3,
    once: true,
  });

  const sequence = useSequence();
  const itemIndex = useItemIndex();
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (!sequence || itemIndex === null) return;
    if (!sequence.sequenceStarted) return;
    if (hasStarted) return;
    if (sequence.activeIndex === itemIndex) {
      setHasStarted(true);
    }
  }, [sequence, hasStarted, itemIndex]);

  useEffect(() => {
    if (prefersReducedMotion && sequence && itemIndex !== null && hasStarted) {
      sequence.completeItem(itemIndex);
    }
  }, [prefersReducedMotion, sequence, itemIndex, hasStarted]);

  const shouldAnimate = prefersReducedMotion
    ? true
    : sequence
      ? hasStarted
      : startOnView
        ? isInView
        : true;

  return (
    <motion.div
      ref={elementRef}
      initial={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -5 }}
      animate={shouldAnimate ? { opacity: 1, y: 0 } : { opacity: 0, y: -5 }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.25,
        delay: sequence || prefersReducedMotion ? 0 : delay / 1000,
      }}
      className={cn("grid font-mono text-xs leading-relaxed tracking-tight", className)}
      onAnimationComplete={() => {
        if (!sequence) return;
        if (itemIndex === null) return;
        sequence.completeItem(itemIndex);
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export interface TypingAnimationProps extends Omit<MotionProps, "children"> {
  children: string;
  className?: string;
  duration?: number;
  delay?: number;
  as?: MotionElementType;
  startOnView?: boolean;
}

export const TypingAnimation = ({
  children,
  className,
  duration = 12,
  delay = 0,
  as: Component = "span",
  startOnView = false,
  ...props
}: TypingAnimationProps) => {
  const MotionComponent = motionElements[
    Component
  ] as TerminalTypingMotionComponent;

  const prefersReducedMotion = useReducedMotion();
  const [displayedText, setDisplayedText] = useState<string>(
    prefersReducedMotion ? children : "",
  );
  const [started, setStarted] = useState(Boolean(prefersReducedMotion));
  const elementRef = useRef<HTMLElement | null>(null);
  const isInView = useInView(elementRef as React.RefObject<Element>, {
    amount: 0.3,
    once: true,
  });

  const sequence = useSequence();
  const itemIndex = useItemIndex();
  const hasSequence = sequence !== null;
  const sequenceStarted = sequence?.sequenceStarted ?? false;
  const sequenceActiveIndex = sequence?.activeIndex ?? null;
  const sequenceCompleteItemRef = useRef<
    SequenceContextValue["completeItem"] | null
  >(null);
  const sequenceItemIndexRef = useRef<number | null>(null);

  useEffect(() => {
    sequenceCompleteItemRef.current = sequence?.completeItem ?? null;
    sequenceItemIndexRef.current = itemIndex;
  }, [sequence?.completeItem, itemIndex]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayedText(children);
      const completeItem = sequenceCompleteItemRef.current;
      const currentItemIndex = sequenceItemIndexRef.current;
      if (completeItem && currentItemIndex !== null) {
        completeItem(currentItemIndex);
      }
      return;
    }

    let startTimeout: ReturnType<typeof setTimeout> | null = null;

    if (hasSequence && itemIndex !== null) {
      if (sequenceStarted && !started && sequenceActiveIndex === itemIndex) {
        setStarted(true);
      }
    } else if (!startOnView || isInView) {
      startTimeout = setTimeout(() => setStarted(true), delay);
    }

    return () => {
      if (startTimeout !== null) {
        clearTimeout(startTimeout);
      }
    };
  }, [
    delay,
    startOnView,
    isInView,
    started,
    hasSequence,
    sequenceActiveIndex,
    sequenceStarted,
    itemIndex,
    prefersReducedMotion,
    children,
  ]);

  useEffect(() => {
    if (prefersReducedMotion) return;

    let typingEffect: ReturnType<typeof setInterval> | null = null;

    if (started) {
      let i = 0;
      typingEffect = setInterval(() => {
        if (i < children.length) {
          setDisplayedText(children.substring(0, i + 1));
          i++;
        } else {
          if (typingEffect !== null) {
            clearInterval(typingEffect);
          }
          const completeItem = sequenceCompleteItemRef.current;
          const currentItemIndex = sequenceItemIndexRef.current;
          if (completeItem && currentItemIndex !== null) {
            completeItem(currentItemIndex);
          }
        }
      }, duration);
    }

    return () => {
      if (typingEffect !== null) {
        clearInterval(typingEffect);
      }
    };
  }, [children, duration, started, prefersReducedMotion]);

  return (
    <MotionComponent
      ref={elementRef}
      className={cn("font-mono text-xs leading-relaxed tracking-tight", className)}
      {...props}
    >
      {displayedText}
    </MotionComponent>
  );
};

export interface TerminalProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  sequence?: boolean;
  startOnView?: boolean;
}

export const Terminal = ({
  children,
  className,
  title = "agent-passport",
  sequence = true,
  startOnView = false,
}: TerminalProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(containerRef as React.RefObject<Element>, {
    amount: 0.3,
    once: true,
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const sequenceHasStarted = sequence ? !startOnView || isInView : false;

  const contextValue = useMemo<SequenceContextValue | null>(() => {
    if (!sequence) return null;
    return {
      completeItem: (index: number) => {
        setActiveIndex((current) => (index === current ? current + 1 : current));
      },
      activeIndex,
      sequenceStarted: sequenceHasStarted,
    };
  }, [sequence, activeIndex, sequenceHasStarted]);

  const wrappedChildren = useMemo(() => {
    if (!sequence) return children;
    const array = Children.toArray(children);
    return array.map((child, index) => (
      <ItemIndexContext.Provider key={index} value={index}>
        {child as React.ReactNode}
      </ItemIndexContext.Provider>
    ));
  }, [children, sequence]);

  const content = (
    <div
      ref={containerRef}
      className={cn(
        "z-0 w-full overflow-hidden rounded-lg border border-(--ap-guilloche)/70 bg-(--ap-ink) text-[#E9F1EE] shadow-xs",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-(--ap-guilloche)/30 px-4 py-2.5">
        <div className="flex flex-row items-center gap-x-2">
          <div className="h-2.5 w-2.5 rounded-full bg-(--ap-refused)/80" />
          <div className="h-2.5 w-2.5 rounded-full bg-(--ap-changed)/80" />
          <div className="h-2.5 w-2.5 rounded-full bg-(--ap-verified)/80" />
        </div>
        <span className="font-mono text-xs text-[#9DC3B8]">{title}</span>
      </div>
      <pre className="overflow-x-auto p-4">
        <code className="grid gap-y-1.5 font-mono text-xs leading-relaxed">
          {wrappedChildren}
        </code>
      </pre>
    </div>
  );

  if (!sequence) return content;

  return (
    <SequenceContext.Provider value={contextValue}>
      {content}
    </SequenceContext.Provider>
  );
};
