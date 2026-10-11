import type { ReactNode } from "react";

import { cx } from "@/utils/cx";

export type Tone = "neutral" | "success" | "danger" | "warning" | "accent" | "primary";

interface StatusBadgeProps {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
  pulse?: boolean;
  className?: string;
}

export function StatusBadge({ tone = "neutral", children, icon, pulse, className }: StatusBadgeProps) {
  return (
    <span className={cx("badge", `badge--${tone}`, pulse && "badge--pulse", className)}>
      {icon}
      {children}
    </span>
  );
}
