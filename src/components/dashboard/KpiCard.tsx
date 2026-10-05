import type { ComponentType, SVGProps } from "react";
import { TrendDownIcon, TrendUpIcon } from "@/components/icons";

interface KpiCardProps {
  label: string;
  value: string;
  /** Supporting detail under the value, e.g. "vs 44 yesterday". */
  caption?: string;
  /** Percentage change against the comparison period. */
  deltaPercent?: number;
  deltaCaption?: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  accent?: "flame" | "navy" | "good" | "info";
}

const accents = {
  flame: "bg-flame-500/12 text-flame-700",
  navy: "bg-navy-900/8 text-navy-800",
  good: "bg-good-soft text-good",
  info: "bg-info-soft text-info",
} as const;

export function KpiCard({
  label,
  value,
  caption,
  deltaPercent,
  deltaCaption,
  icon: Icon,
  accent = "navy",
}: KpiCardProps) {
  const hasDelta = typeof deltaPercent === "number";
  const rising = hasDelta && deltaPercent > 0;
  const flat = hasDelta && deltaPercent === 0;

  return (
    <article className="rounded-xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-ink-soft">{label}</p>
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${accents[accent]}`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>

      <p className="mt-3 font-mono text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums">
        {value}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        {hasDelta ? (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${
              flat
                ? "bg-canvas text-ink-soft"
                : rising
                  ? "bg-good-soft text-good"
                  : "bg-bad-soft text-bad"
            }`}
          >
            {flat ? null : rising ? (
              <TrendUpIcon className="h-3.5 w-3.5" />
            ) : (
              <TrendDownIcon className="h-3.5 w-3.5" />
            )}
            {flat ? "No change" : `${rising ? "+" : ""}${deltaPercent}%`}
          </span>
        ) : null}
        {deltaCaption ? (
          <span className="text-ink-faint">{deltaCaption}</span>
        ) : null}
        {caption ? <span className="text-ink-faint">{caption}</span> : null}
      </div>
    </article>
  );
}
