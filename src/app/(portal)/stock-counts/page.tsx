import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Banner } from "@/components/customers/Form";
import { SavedToast } from "@/components/customers/SavedToast";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  FilterBar,
  KpiCard,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { currentStaffAccess } from "@/lib/auth";
import { getCustomerContext } from "@/lib/db";
import { resolveVariance } from "./actions";

export const metadata: Metadata = { title: "Stock counts" };
export const dynamic = "force-dynamic";

const asText = (v: unknown): string => (v == null ? "" : String(v));
const asNum = (v: unknown): number => Number(v ?? 0);
const asBool = (v: unknown): boolean => v === true || v === "t" || v === "true";

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Nairobi",
  }).format(new Date(iso));
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Nairobi",
  }).format(new Date(iso));
}

function dateInput(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(d);
}

function safeDate(v: string | undefined, fallback: string): string {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback;
}

type VarianceRow = {
  id: string;
  count_date: string;
  counted_by: string;
  counted_at: string;
  resolved: boolean;
  resolved_by: string;
  resolved_note: string;
  note: string;
  location_id: string;
  location_name: string;
  variant_id: string;
  variant_name: string;
  brand_name: string;
  size_kg: string;
  refills: number;
  empties: number;
  ledger_refills: number;
  ledger_empties: number;
  refill_variance: number;
  empty_variance: number;
  total_variance: number;
};

type LocationOption = { id: string; name: string };

function varianceTone(abs: number): "ok" | "warn" | "critical" {
  if (abs === 0) return "ok";
  if (abs <= 2) return "warn";
  return "critical";
}

function varianceLabel(v: number): string {
  if (v === 0) return "✓ Match";
  return v > 0 ? `+${v}` : `${v}`;
}

export default async function StockCountsPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    branch?: string;
    unresolved?: string;
    error?: string;
    saved?: string;
  }>;
}) {
  const params = await searchParams;
  const staff = await currentStaffAccess();
  if (!staff || staff.role === "attendant" || staff.role === "rider") {
    redirect("/");
  }

  const today = dateInput(new Date());
  const date = safeDate(params.date, today);
  const branchFilter = params.branch ?? "";
  const unresolvedOnly = params.unresolved === "1";

  const { products } = await getCustomerContext();

  // Load branch list for filter dropdown
  let branches: LocationOption[] = [];
  let rows: VarianceRow[] = [];

  if (products) {
    const branchRows = await products.db.query<Record<string, unknown>>(
      "SELECT id, name FROM stock_locations WHERE kind = 'BRANCH' AND active ORDER BY name",
      [],
    );
    branches = branchRows.map((r) => ({ id: asText(r.id), name: asText(r.name) }));

    const raw = await products.db.query<Record<string, unknown>>(
      `SELECT * FROM v_shift_count_variances
        WHERE count_date = $1::date
          AND ($2 = '' OR location_id = $2)
          AND ($3 = false OR resolved = false)
        ORDER BY resolved ASC, location_name ASC, variant_name ASC`,
      [date, branchFilter, unresolvedOnly],
    );

    rows = raw.map((r) => ({
      id: asText(r.id),
      count_date: asText(r.count_date),
      counted_by: asText(r.counted_by),
      counted_at: asText(r.counted_at),
      resolved: asBool(r.resolved),
      resolved_by: asText(r.resolved_by),
      resolved_note: asText(r.resolved_note),
      note: asText(r.note),
      location_id: asText(r.location_id),
      location_name: asText(r.location_name),
      variant_id: asText(r.variant_id),
      variant_name: asText(r.variant_name),
      brand_name: asText(r.brand_name),
      size_kg: asText(r.size_kg),
      refills: asNum(r.refills),
      empties: asNum(r.empties),
      ledger_refills: asNum(r.ledger_refills),
      ledger_empties: asNum(r.ledger_empties),
      refill_variance: asNum(r.refill_variance),
      empty_variance: asNum(r.empty_variance),
      total_variance: asNum(r.total_variance),
    }));
  }

  // KPIs
  const totalVariances = rows.filter((r) => r.total_variance !== 0).length;
  const unresolved = rows.filter((r) => !r.resolved && r.total_variance !== 0).length;
  const branchesWithVariance = new Set(
    rows.filter((r) => r.total_variance !== 0).map((r) => r.location_id),
  ).size;

  // Group by location
  const byLocation = new Map<string, { name: string; rows: VarianceRow[] }>();
  for (const row of rows) {
    if (!byLocation.has(row.location_id)) {
      byLocation.set(row.location_id, { name: row.location_name, rows: [] });
    }
    byLocation.get(row.location_id)!.rows.push(row);
  }

  return (
    <>
      <SavedToast key={params.saved ?? "none"} message={params.saved ?? null} />
      <AppShell
        title="Stock counts"
        subtitle={`Shift count variances · ${date}`}
        staff={currentStaff}
        branch={stationName}
        activeHref="/stock-counts"
      >
        <PageHeader
          title="Stock counts"
          subtitle="Review end-of-shift counts and resolve variances"
        />

        {params.error ? <Banner tone="bad">{params.error}</Banner> : null}

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="Variances today"
            value={String(totalVariances)}
            subtext={date}
          />
          <KpiCard
            label="Unresolved"
            value={String(unresolved)}
            subtext={unresolved === 0 ? "All clear ✓" : "Needs attention"}
          />
          <KpiCard
            label="Branches affected"
            value={String(branchesWithVariance)}
            subtext="with non-zero variance"
          />
        </div>

        {/* Filter bar */}
        <FilterBar
          search={
            <form action="/stock-counts" method="get" className="flex flex-wrap gap-2 items-center">
              <div className="flex items-center gap-1">
                <label className="text-xs font-medium text-ink-subtle" htmlFor="sc-date">
                  Date
                </label>
                <input
                  id="sc-date"
                  type="date"
                  name="date"
                  defaultValue={date}
                  max={today}
                  className="h-10 rounded-md border border-border bg-surface px-2 text-sm"
                />
              </div>

              {branches.length > 1 && (
                <div className="flex items-center gap-1">
                  <label className="text-xs font-medium text-ink-subtle" htmlFor="sc-branch">
                    Branch
                  </label>
                  <select
                    id="sc-branch"
                    name="branch"
                    defaultValue={branchFilter}
                    className="h-10 rounded-md border border-border bg-surface px-2 text-sm"
                  >
                    <option value="">All branches</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  name="unresolved"
                  value="1"
                  defaultChecked={unresolvedOnly}
                  className="h-4 w-4 rounded border-border accent-orange-500"
                />
                <span className="text-sm text-ink-subtle">Unresolved only</span>
              </label>

              <button
                type="submit"
                className="h-10 rounded-md bg-orange-500 px-4 text-sm font-semibold text-white"
              >
                Apply
              </button>
            </form>
          }
          filters={
            <p className="text-sm text-ink-subtle">
              {rows.length} count{rows.length === 1 ? "" : "s"} · {date}
            </p>
          }
        />

        {rows.length === 0 ? (
          <Card>
            <EmptyState
              title="No counts for this date"
              description="No shift counts have been submitted yet for the selected date and filters."
            />
          </Card>
        ) : (
          Array.from(byLocation.entries()).map(([locationId, { name, rows: locRows }]) => (
            <Card key={locationId} title={name}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium text-ink-subtle">
                      <th className="pb-2 pr-4 font-medium">Product</th>
                      <th className="pb-2 pr-4 text-right font-medium">Counted</th>
                      <th className="pb-2 pr-4 text-right font-medium">Expected</th>
                      <th className="pb-2 pr-4 text-right font-medium">Variance</th>
                      <th className="pb-2 pr-4 font-medium">Counted by</th>
                      <th className="pb-2 font-medium">Status / Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {locRows.map((row) => {
                      const absVariance = Math.abs(row.total_variance);
                      const tone = varianceTone(absVariance);
                      const hasVariance = row.total_variance !== 0;
                      return (
                        <tr key={row.id} className="align-top">
                          <td className="py-3 pr-4">
                            <span className="block font-medium text-ink">
                              {row.brand_name} {row.size_kg ? `${row.size_kg}kg` : ""} {row.variant_name}
                            </span>
                            {row.note && (
                              <span className="mt-0.5 block text-xs text-ink-subtle italic">
                                Note: {row.note}
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <span className="block">{row.refills} refills</span>
                            <span className="block text-ink-subtle">{row.empties} empties</span>
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <span className="block">{row.ledger_refills} refills</span>
                            <span className="block text-ink-subtle">{row.ledger_empties} empties</span>
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <StatusBadge tone={tone}>
                              {varianceLabel(row.total_variance)}
                            </StatusBadge>
                            {hasVariance && (
                              <span className="mt-0.5 block text-xs text-ink-subtle">
                                R: {varianceLabel(row.refill_variance)} / E: {varianceLabel(row.empty_variance)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <span className="block text-ink">{row.counted_by}</span>
                            <span className="block text-xs text-ink-subtle">
                              {fmtTime(row.counted_at)}
                            </span>
                          </td>
                          <td className="py-3">
                            {row.resolved ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2 py-0.5 text-xs text-ink-subtle">
                                ✓ Reviewed by {row.resolved_by}
                                {row.resolved_note && ` · ${row.resolved_note}`}
                              </span>
                            ) : hasVariance ? (
                              <div className="flex flex-wrap gap-2">
                                <form action={resolveVariance}>
                                  <input type="hidden" name="id" value={row.id} />
                                  <Button type="submit" variant="secondary" size="sm">
                                    Mark reviewed
                                  </Button>
                                </form>
                                <ButtonLink
                                  href={`/stock-counts/${row.id}/adjust`}
                                  variant="danger"
                                  size="sm"
                                >
                                  Adjust stock
                                </ButtonLink>
                              </div>
                            ) : (
                              <StatusBadge tone="ok">Match — no action needed</StatusBadge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))
        )}
      </AppShell>
    </>
  );
}
