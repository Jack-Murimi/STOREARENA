import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The only button in the app.
 *
 * `primary` is orange with DARK text — white on --orange-500 fails 4.5:1.
 * There is one primary per screen; everything else is secondary or ghost.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-orange-500 text-ink hover:bg-orange-400 active:bg-orange-600 border border-transparent font-semibold",
  secondary:
    "bg-surface text-ink border border-border hover:bg-surface-muted active:bg-border font-medium",
  ghost:
    "bg-transparent text-ink-muted border border-transparent hover:bg-surface-muted hover:text-ink font-medium",
  danger:
    "bg-surface text-critical border border-border hover:bg-critical-bg active:bg-critical-bg font-medium",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-sm rounded-md gap-1.5",
  md: "h-9 px-3 text-base rounded-md gap-2",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-[var(--touch-target)] items-center justify-center whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** The same button as a link, for navigation that must stay an anchor. */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={`inline-flex min-h-[var(--touch-target)] items-center justify-center whitespace-nowrap transition-colors duration-150 sm:min-h-0 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </a>
  );
}
