/**
 * Source: https://raw.githubusercontent.com/serafimcloud/21st/main/apps/web/components/ui/hero-pill.tsx (https://github.com/serafimcloud/21st/blob/main/apps/web/components/ui/hero-pill.tsx)
 * Library: 21st.dev
 * License: MIT License (https://github.com/serafimcloud/21st/blob/main/LICENSE)
 */

import React from "react";
import { cn } from "../../lib/utils";

export interface HeroPillProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  text: string;
  className?: string;
}

export function HeroPill({
  icon,
  text,
  className,
  ...props
}: HeroPillProps) {
  return (
    <div className={cn("inline-flex", className)} {...props}>
      <p className="inline-flex items-center justify-center rounded-md border border-(--ap-guilloche) bg-(--ap-paper) px-3 py-1 text-xs font-semibold text-(--ap-text)">
        {icon && (
          <span className="mr-2 flex shrink-0 border-r border-(--ap-guilloche) pr-2 text-(--ap-verified)">
            {icon}
          </span>
        )}
        <span>{text}</span>
      </p>
    </div>
  );
}
