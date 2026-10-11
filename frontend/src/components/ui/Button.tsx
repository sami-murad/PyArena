import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

import { Spinner } from "@/components/ui/Spinner";
import { cx } from "@/utils/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconAfter?: ReactNode;
  block?: boolean;
}

export interface ButtonProps extends CommonProps, ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

function classes({ variant = "secondary", size = "md", block }: CommonProps, extra?: string) {
  return cx("btn", `btn--${variant}`, `btn--${size}`, block && "btn--block", extra);
}

export function Button({
  variant,
  size,
  icon,
  iconAfter,
  block,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classes({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size="sm" label="" /> : icon}
      {children && <span className="btn__label">{children}</span>}
      {!loading && iconAfter}
    </button>
  );
}

export interface ButtonLinkProps extends CommonProps, LinkProps {}

export function ButtonLink({ variant, size, icon, iconAfter, block, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={classes({ variant, size, block }, className)} {...rest}>
      {icon}
      {children && <span className="btn__label">{children}</span>}
      {iconAfter}
    </Link>
  );
}
