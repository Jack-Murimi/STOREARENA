import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Banner } from "@/components/customers/Form";
import { Button, ButtonLink, Card, PageHeader } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { currentStaffAccess } from "@/lib/auth";
import { getCustomerContext } from "@/lib/db";
import { applyStocktake } from "../../actions";

export const metadata: Metadata = { title: "Adjust stock" };
export const dynamic = "force-dynamic";

const asText = (v: unknown): string => (v == null ? "" : String(v));
const asNum = (v: unknown): number => Number(v ?? 0);
const asBool = (v: unknown): boolean => v === true || v === "t" || v === "true";

export default async function AdjustPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const qp = await searchParams;

  const staff = await currentStaffAccess();
  // Only admin/director can apply stocktake corrections (matches actions.ts requireAdminAccess)
  if (!staff || staff.role === "attendant" || staff.role === "rider" || staff.role === "manager") {
    redirect("/stock-counts");
  }

  const { products } = await getCustomerContext();
  if (!products) {
    redirect("/stock-counts?error=Database+unavailable");
  }

  const rows = await products.db.query<Record<string, unknown>>(
    "SELECT * FROM v_shift_count_variances WHERE id = $1",
    [id],
  );

  if (!rows.length) notFound();
  const row = rows[0];

  const countId = asText(row.id);
  const locationId = asText(row.location_id);
  const variantId = asText(row.variant_id);
  const locationName = asText(row.location_name);
  const brandName = asText(row.brand_name);
  const sizeKg = asText(row.size_kg);
  const variantName = asText(row.variant_name);
  const refills = asNum(row.refills);
  const empties = asNum(row.empties);
  const ledgerRefills = asNum(row.ledger_refills);
  const ledgerEmpties = asNum(row.ledger_empties);
  const refillVariance = asNum(row.refill_variance);
  const emptyVariance = asNum(row.empty_variance);
  const totalVariance = asNum(row.total_variance);
  const resolved = asBool(row.resolved);
  const countedBy = asText(row.counted_by);
  const countDate = asText(row.count_date);

  const productLabel = `${brandName}${sizeKg ? ` ${sizeKg}kg` : ""} ${variantName}`.trim();

  function fmt(n: number): string {
    return n > 0 ? `+${n}` : `${n}`;
  }

  if (totalVariance === 0) {
    return (
      <AppShell
        title="Adjust stock"
        subtitle="No adjustment needed"
        staff={currentStaff}
        branch={stationName}
        activeHref="/stock-counts"
      >
        <PageHeader title="Adjust stock" subtitle={productLabel} />
        <Card title="No adjustment needed">
          <p className="text-sm text-ink-subtle">
            The counted quantity matches the ledger for this product at {locationName}. No stock
            adjustment is required.
          </p>
          <div className="mt-4">
            <ButtonLink href="/stock-counts" variant="secondary">
              ← Back to stock counts
            </ButtonLink>
          </div>
        </Card>
      </AppShell>
    );
  }

  if (resolved) {
    return (
      <AppShell
        title="Adjust stock"
        subtitle="Already resolved"
        staff={currentStaff}
        branch={stationName}
        activeHref="/stock-counts"
      >
        <PageHeader title="Adjust stock" subtitle={productLabel} />
        <Card title="Already resolved">
          <p className="text-sm text-ink-subtle">
            This shift count has already been resolved. No further adjustment is possible.
          </p>
          <div className="mt-4">
            <ButtonLink href="/stock-counts" variant="secondary">
              ← Back to stock counts
            </ButtonLink>
          </div>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Adjust stock"
      subtitle={`${productLabel} · ${locationName}`}
      staff={currentStaff}
      branch={stationName}
      activeHref="/stock-counts"
    >
      <PageHeader
        title="Adjust stock"
        subtitle={`${productLabel} · ${locationName} · ${countDate}`}
        action={
          <ButtonLink href="/stock-counts" variant="secondary">
            Cancel
          </ButtonLink>
        }
      />

      {qp.error && <Banner tone="bad">{qp.error}</Banner>}

      {/* Warning banner — this WILL change the ledger */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex gap-3">
          <span className="text-lg leading-none">⚠️</span>
          <div>
            <p className="font-semibold text-red-800">This will change the stock ledger</p>
            <p className="mt-1 text-sm text-red-700">
              Applying this correction writes a STOCKTAKE movement to the ledger and updates live
              inventory. This action cannot be undone. Only proceed if you have physically verified
              the count.
            </p>
          </div>
        </div>
      </div>

      {/* Variance summary */}
      <Card title="Variance summary">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-ink-subtle">Product</dt>
            <dd className="mt-0.5 font-medium text-ink">{productLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-subtle">Branch</dt>
            <dd className="mt-0.5 font-medium text-ink">{locationName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-subtle">Counted by</dt>
            <dd className="mt-0.5 text-ink">{countedBy}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-subtle">Count date</dt>
            <dd className="mt-0.5 text-ink">{countDate}</dd>
          </div>
        </dl>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-ink-subtle">
                <th className="pb-2 pr-4 font-medium"></th>
                <th className="pb-2 pr-4 text-right font-medium">Counted</th>
                <th className="pb-2 pr-4 text-right font-medium">Ledger (expected)</th>
                <th className="pb-2 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-2 pr-4 font-medium text-ink">Refills</td>
                <td className="py-2 pr-4 text-right">{refills}</td>
                <td className="py-2 pr-4 text-right">{ledgerRefills}</td>
                <td
                  className={`py-2 text-right font-semibold ${
                    refillVariance === 0
                      ? "text-green-600"
                      : Math.abs(refillVariance) <= 2
                        ? "text-orange-600"
                        : "text-red-600"
                  }`}
                >
                  {refillVariance === 0 ? "✓" : fmt(refillVariance)}
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium text-ink">Empties</td>
                <td className="py-2 pr-4 text-right">{empties}</td>
                <td className="py-2 pr-4 text-right">{ledgerEmpties}</td>
                <td
                  className={`py-2 text-right font-semibold ${
                    emptyVariance === 0
                      ? "text-green-600"
                      : Math.abs(emptyVariance) <= 2
                        ? "text-orange-600"
                        : "text-red-600"
                  }`}
                >
                  {emptyVariance === 0 ? "✓" : fmt(emptyVariance)}
                </td>
              </tr>
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-2 pr-4 text-ink">Total</td>
                <td className="py-2 pr-4 text-right">{refills + empties}</td>
                <td className="py-2 pr-4 text-right">{ledgerRefills + ledgerEmpties}</td>
                <td
                  className={`py-2 text-right font-bold ${
                    totalVariance === 0
                      ? "text-green-600"
                      : Math.abs(totalVariance) <= 2
                        ? "text-orange-600"
                        : "text-red-600"
                  }`}
                >
                  {totalVariance === 0 ? "✓ Match" : fmt(totalVariance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Adjustment form */}
      <Card title="Confirm adjustment">
        <form action={applyStocktake} className="grid gap-4">
          <input type="hidden" name="shift_count_id" value={countId} />
          <input type="hidden" name="location_id" value={locationId} />
          <input type="hidden" name="variant_id" value={variantId} />
          <input type="hidden" name="counted_refills" value={String(refills)} />
          <input type="hidden" name="counted_empties" value={String(empties)} />

          <label className="space-y-1">
            <span className="text-sm font-medium text-ink">
              Reason for adjustment <span className="text-red-500">*</span>
            </span>
            <textarea
              name="reason"
              required
              minLength={5}
              rows={3}
              placeholder="e.g. Physical recount confirmed 3 refills, ledger had a posting error from yesterday's delivery."
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <p className="text-xs text-ink-subtle">
              This reason is permanently recorded in the stock ledger. Be specific.
            </p>
          </label>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" variant="danger">
              Apply correction — adjust ledger
            </Button>
            <ButtonLink href="/stock-counts" variant="secondary">
              Cancel
            </ButtonLink>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
