import type { ReactNode } from "react";

/**
 * Status is always colour + icon + text. Colour alone is never enough — a
 * third of men have some colour vision deficiency, and a chip that only turns
 * red tells them nothing.
 */
export type BadgeTone = "ok" | "warn" | "critical" | "info" | "neutral";

const TONES: Record<BadgeTone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  critical: "bg-critical-bg text-critical",
  info: "bg-info-bg text-info",
  neutral: "bg-surface-muted text-ink-muted",
};

const ICONS: Record<BadgeTone, ReactNode> = {
  ok: (
    <path d="M3 8.5 6.5 12 13 5" />
  ),
  warn: (
    <>
      <path d="M8 4.5v5" />
      <path d="M8 12h.01" />
    </>
  ),
  critical: (
    <>
      <path d="M5 5l6 6" />
      <path d="M11 5l-6 6" />
    </>
  ),
  info: (
    <>
      <path d="M8 7.5v5" />
      <path d="M8 4.6h.01" />
    </>
  ),
  neutral: <path d="M4 8h8" />,
};

export function StatusBadge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]} ${className}`}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3 shrink-0"
        aria-hidden="true"
      >
        {ICONS[tone]}
      </svg>
      {children}
    </span>
  );
}
