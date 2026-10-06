import { FlameIcon } from "./icons";

interface BrandMarkProps {
  /** Text colour for the wordmark. */
  tone?: "light" | "dark";
  className?: string;
}

/** Gateway Gas Enterprises lockup: flame tile + wordmark. */
export function BrandMark({ tone = "light", className }: BrandMarkProps) {
  const isLight = tone === "light";
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-flame-400 to-flame-600 text-navy-950 shadow-sm">
        <FlameIcon className="h-5 w-5" />
      </span>
      <span className="leading-tight">
        <span
          className={`block text-base font-semibold tracking-tight ${
            isLight ? "text-white" : "text-ink"
          }`}
        >
          Gateway Gas
        </span>
        <span
          className={`block text-xs font-medium uppercase tracking-[0.16em] ${
            isLight ? "text-white/55" : "text-ink-faint"
          }`}
        >
          Enterprises
        </span>
      </span>
    </div>
  );
}
