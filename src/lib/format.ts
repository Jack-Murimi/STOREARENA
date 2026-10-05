/** Display helpers. Kept free of React so they can be reused in reports/exports. */

const kshFormatter = new Intl.NumberFormat("en-KE", {
  maximumFractionDigits: 0,
});

/** 1050 -> "KSh 1,050" */
export function formatKsh(value: number): string {
  return `KSh ${kshFormatter.format(Math.round(value))}`;
}

/** 44150 -> "KSh 44.2K" for tight spaces such as chart axis labels. */
export function formatKshCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `KSh ${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `KSh ${(value / 1_000).toFixed(1)}K`;
  return formatKsh(value);
}

/** 1350 -> "1,350 kg" */
export function formatKg(value: number): string {
  return `${kshFormatter.format(value)} kg`;
}

/** 6 -> "6 kg" */
export function formatCylinder(sizeKg: number): string {
  return `${sizeKg} kg`;
}

/** 42 -> "42 cylinders", 1 -> "1 cylinder" */
export function formatCylinders(count: number): string {
  return `${kshFormatter.format(count)} ${count === 1 ? "cylinder" : "cylinders"}`;
}

/**
 * Long date label rendered in Nairobi time, e.g. "Monday, 5 October 2026".
 * The timezone is pinned so the header reads the same for every staff member
 * regardless of device locale.
 */
export function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

/** Percent change between two values, rounded. */
export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}
