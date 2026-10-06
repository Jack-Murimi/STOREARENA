import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import Link from "next/link";
import { receiveStock } from "../actions";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { SavedToast } from "@/components/customers/SavedToast";
import { SubmitButton } from "@/components/customers/SubmitButton";
import { StatusBadge } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { LocationKind } from "@/lib/stock/types";

export const metadata: Metadata = {
  title: "Stock movements",
};

/** Stock lives in a database, never in the prerendered HTML. */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const LABELS: Record<string, string> = {
  PURCHASE: "Received",
  REFILL_SALE: "Refill sale",
  NEW_CYLINDER_SALE: "New cylinder sale",
  EXCHANGE: "Exchange",
  EMPTY_RETURN: "Empty returned",
  DEPOT_RETURN: "Returned to depot",
  TRANSFER: "Transfer",
  STOCKTAKE: "Stocktake",
};

const money = (amount: number) => `KSh ${amount.toLocaleString("en-KE")}`;

export default async function ProductStockPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const branchFilter = typeof query.branch === "string" ? query.branch : "";
  const saved = typeof query.saved === "string" ? query.saved : null;
  const error = typeof query.error === "string" ? query.error : null;

  const { products, stock, notice, diagnostic } = await getCustomerContext();

  const shell = (body: React.ReactNode) => (
    <AppShell
      title="Stock"
      subtitle="Movements"
      staff={currentStaff}
      branch={stationName}
      activeHref="/inventory"
    >
      {body}
    </AppShell>
  );

  if (!products || !stock) {
    return shell(<DatabaseUnavailable notice={notice} diagnostic={diagnostic} />);
  }

  const product = await stock.product(id);
  if (!product) {
    return shell(
      <p className="rounded-xl border border-line bg-card px-5 py-8 text-center text-sm text-ink-soft">
        There is no product with that id.{" "}
        <Link href="/inventory" className="font-semibold text-flame-700 hover:underline">
          Back to the inventory
        </Link>
      </p>,
    );
  }

  const [locations, rows, movements, lots] = await Promise.all([
    products.listLocations(),
    stock.stockRows({ locationId: branchFilter || null }),
    stock.movements(id, { locationId: branchFilter || null }),
    stock.lots(id, { locationId: branchFilter || null }),
  ]);

  const line = rows.find((r) => r.variantId === id);
  const branches = locations.filter((l) => l.active && l.kind === LocationKind.Branch);
  const branch = locations.find((l) => l.id === branchFilter) ?? null;

  const full = line?.refills ?? 0;
  const empty = line?.empties ?? 0;
  const costOnHand = line?.costOnHand ?? 0;
  const averageCost = full > 0 ? costOnHand / full : 0;

  const queryFor = (locationId: string) =>
    locationId ? `/inventory/${id}?branch=${encodeURIComponent(locationId)}` : `/inventory/${id}`;

  return (
    <>
      <SavedToast key={saved ?? error ?? "none"} message={saved ?? error} tone={error ? "bad" : "good"} />
      {shell(
        <>
          {notice ? (
            <p className="rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-warn">
              {notice}
            </p>
          ) : null}

          <div>
            <Link
              href="/inventory"
              className="text-xs font-medium text-ink-soft hover:text-ink"
            >
              ← Inventory
            </Link>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-ink">
              {product.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge tone={product.categoryName === "LPG cylinders" ? "info" : "neutral"}>
                {product.categoryName}
              </StatusBadge>
              <span className="text-xs text-ink-soft">
                {product.brandName}
                {product.sizeKg ? ` · ${product.sizeKg} kg` : ""} · {product.code}
              </span>
            </div>
          </div>

          {/* ---- what is on the shelf, and what it cost ---- */}
          <div className="grid gap-3 sm:grid-cols-5">
            {[
              { label: "Full", value: String(full), hint: "ready to sell" },
              { label: "Empty", value: String(empty), hint: "back from customers" },
              { label: "Total", value: String(full + empty), hint: "cylinders held" },
              {
                label: "Last cost",
                value: line?.lastCost === null || line?.lastCost === undefined ? "—" : money(line.lastCost),
                hint: line?.lastPurchasedOn ? `bought ${line.lastPurchasedOn}` : "not bought yet",
              },
              {
                label: "Selling price",
                value: product.sellingPrice === null ? "—" : money(product.sellingPrice),
                hint:
                  averageCost > 0
                    ? `margin ${money(product.sellingPrice === null ? 0 : product.sellingPrice - averageCost)}`
                    : "no cost yet",
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-line bg-card px-4 py-3 shadow-card"
              >
                <div className="text-xs uppercase tracking-wide text-ink-soft">
                  {card.label}
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {card.value}
                </div>
                <div className="text-xs text-ink-soft/80">{card.hint}</div>
              </div>
            ))}
          </div>

          {/* ---- branch filter ---- */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Branch
            </span>
            <a
              href={`/inventory/${id}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                branchFilter === ""
                  ? "bg-flame-600 text-white"
                  : "bg-white text-ink ring-1 ring-line hover:bg-canvas"
              }`}
            >
              All branches
            </a>
            {branches.map((location) => (
              <a
                key={location.id}
                href={queryFor(location.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  branchFilter === location.id
                    ? "bg-flame-600 text-white"
                    : "bg-white text-ink ring-1 ring-line hover:bg-canvas"
                }`}
              >
                {location.name}
              </a>
            ))}
          </div>

          {/* ---- the batches a sale will consume, oldest first ---- */}
          <section className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
            <div className="border-b border-line px-5 py-3">
              <h2 className="text-base font-semibold tracking-tight text-ink">
                Batches still on the shelf
              </h2>
              <p className="text-xs text-ink-soft">
                A sale takes from the top of this list first, so its cost is what those cylinders
                actually cost.
              </p>
            </div>
            {lots.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-soft">
                Nothing costed here yet. Record a delivery below.
              </p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
                    <th className="px-5 py-2.5 font-semibold">Next to go</th>
                    <th className="px-3 py-2.5 font-semibold">Bought</th>
                    <th className="px-3 py-2.5 font-semibold">Branch</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Left</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Unit cost</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lots.map((lot, index) => (
                    <tr key={lot.lotId} className="text-sm hover:bg-canvas/60">
                      <td className="px-5 py-2.5 text-ink-soft">
                        {index === 0 ? (
                          <span className="rounded-full bg-flame-600 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                            sells next
                          </span>
                        ) : (
                          <span className="text-ink-soft/60">#{index + 1}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">{lot.purchasedOn}</td>
                      <td className="px-3 py-2.5">{lot.locationName}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                        {lot.remaining}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                        {money(lot.unitCostKsh)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-ink">
                        {money(lot.remaining * lot.unitCostKsh)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ---- receive stock ---- */}
          <section className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
            <div className="border-b border-line px-5 py-3">
              <h2 className="text-base font-semibold tracking-tight text-ink">
                Receive a delivery
              </h2>
              <p className="text-xs text-ink-soft">
                Adds a batch at the price you paid, which is what the cost column and the margin
                are worked from.
              </p>
            </div>
            <form
              action={receiveStock}
              className="grid gap-2 px-5 py-4 sm:grid-cols-[170px_100px_130px_150px_1fr_150px_auto]"
            >
              <input type="hidden" name="variantId" value={id} />
              <select
                name="locationId"
                required
                className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
              >
                <option value="">Branch…</option>
                {branches.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              <input
                name="quantity"
                required
                inputMode="numeric"
                placeholder="Qty"
                className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
              />
              <input
                name="unitCostKsh"
                required
                inputMode="decimal"
                placeholder="Unit cost"
                className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
              />
              <input
                type="date"
                name="purchasedOn"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
              />
              <input
                name="reference"
                placeholder="Delivery note / depot ref"
                className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
              />
              <input
                name="actor"
                required
                placeholder="Who received it"
                className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
              />
              <SubmitButton pendingLabel="Saving…">Receive</SubmitButton>
            </form>
          </section>

          {/* ---- the movement trail ---- */}
          <section className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <h2 className="text-base font-semibold tracking-tight text-ink">
                Stock movements
              </h2>
              <span className="text-xs text-ink-soft">
                {branch ? `at ${branch.name}` : "every branch"} · {movements.length} shown
              </span>
            </div>
            {movements.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-soft">
                Nothing has moved yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
                      <th className="px-5 py-2.5 font-semibold">When</th>
                      <th className="px-3 py-2.5 font-semibold">What</th>
                      <th className="px-3 py-2.5 font-semibold">Branch</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Balance</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Unit cost</th>
                      <th className="px-3 py-2.5 font-semibold">Reason</th>
                      <th className="px-5 py-2.5 font-semibold">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {movements.map((movement) => (
                      <tr key={`${movement.id}-${movement.custody ?? movement.state}`} className="text-sm hover:bg-canvas/60">
                        <td className="px-5 py-2.5 text-ink-soft">
                          {movement.occurredAt.slice(0, 10)}
                          <span className="block text-xs text-ink-soft/70">
                            {movement.occurredAt.slice(11, 16)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-ink">
                            {LABELS[movement.operation] ?? movement.operation}
                          </span>
                          <span className="block text-xs text-ink-soft/70">
                            {movement.state ? movement.state.toLowerCase() : movement.custody?.toLowerCase()}
                            {movement.counterpartyName ? ` · ${movement.counterpartyName}` : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">{movement.locationName}</td>
                        <td
                          className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                            movement.quantity >= 0 ? "text-good" : "text-bad"
                          }`}
                        >
                          {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                          {movement.balanceAfter}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                          {movement.unitCostKsh === null ? "—" : money(movement.unitCostKsh)}
                        </td>
                        <td className="px-3 py-2.5 text-ink-soft">
                          {movement.reason}
                          {movement.reference ? (
                            <span className="block font-mono text-xs text-ink-soft/70">
                              {movement.reference}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-5 py-2.5">{movement.actor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>,
      )}
    </>
  );
}
