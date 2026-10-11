import { cx } from "@/utils/cx";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  /** Accessible label. Pass "" when a parent already announces the busy state. */
  label?: string;
  className?: string;
}

export function Spinner({ size = "md", label = "Loading", className }: SpinnerProps) {
  return (
    <span
      className={cx("spinner", `spinner--${size}`, className)}
      role={label ? "status" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    />
  );
}

export function PageSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="page-spinner">
      <Spinner size="lg" label={label} />
    </div>
  );
}
