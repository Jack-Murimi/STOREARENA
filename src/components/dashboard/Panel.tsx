import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Padding inside the panel body. Pass "" for edge-to-edge tables. */
  bodyClassName?: string;
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName = "p-5",
}: PanelProps) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${
        className ?? ""
      }`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[14.5px] font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-[12.5px] text-ink-soft">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

interface PillProps {
  children: ReactNode;
  tone: "good" | "warn" | "bad" | "info" | "neutral";
  className?: string;
}

const pillTones: Record<PillProps["tone"], string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  neutral: "bg-canvas text-ink-soft",
};

export function Pill({ children, tone, className }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap ${
        pillTones[tone]
      } ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
