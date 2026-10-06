import type { Metadata } from "next";
import { createLocation } from "./actions";
import { SubmitButton } from "@/components/customers/SubmitButton";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { SavedToast } from "@/components/customers/SavedToast";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Pill } from "@/components/dashboard/Panel";
import { NewProductForm } from "@/components/inventory/NewProductForm";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { LocationKind } from "@/lib/stock/types";
import type { StockLocation } from "@/lib/stock/types";

export const metadata: Metadata = {
  title: "Inventory",
};

/** Stock lives in a database, never in the prerendered HTML. */
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const categoryFilter = typeof params.cat === "string" ? params.cat : "";
  const branchFilter = typeof params.branch === "string" ? params.branch : "";
  const saved = typeof params.saved === "string" ? params.saved : null;
  const error = typeof params.error === "string" ? params.error : null;

  const { products, stock, notice, diagnostic } = await getCustomerContext();

  if (!products) {
    return (
      <div className="flex min-h-screen bg-canvas">
        <Sidebar staff={currentStaff} station={stationName} activeHref="/inventory" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            title="Inventory"
            subtitle="Products and stock"
            staff={currentStaff}
            activeHref="/inventory"
          />
          <main className="flex-1 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
            <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
          </main>
        </div>
      </div>
    );
  }

  if (!stock) return null;

  const [categories, brands, locations, inventory] = await Promise.all([
    products.listCategories(),
    products.listBrands(),
    products.listLocations(),
    stock.stockRows({ locationId: branchFilter || null }),
  ]);

  const activeLocations = locations.filter((l) => l.active);
  const branch = activeLocations.find((l) => l.id === branchFilter) ?? null;
  const showing = categoryFilter
    ? categories.find((c) => c.id === categoryFilter)
    : null;

  const rows = categoryFilter
    ? inventory.filter((line) => line.categoryId === categoryFilter)
    : inventory;

  const totalFull = rows.reduce((sum, line) => sum + line.refills, 0);
  const totalEmpty = rows.reduce((sum, line) => sum + line.empties, 0);
  const stockValue = rows.reduce((sum, line) => sum + line.costOnHand, 0);
  const money = (amount: number) => `KSh ${amount.toLocaleString("en-KE")}`;

  return (
    <>
      <SavedToast key={saved ?? error ?? "none"} message={saved ?? error} tone={error ? "bad" : "good"} />
      <div className="flex min-h-screen bg-canvas">
        <Sidebar staff={currentStaff} station={stationName} activeHref="/inventory" />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            title="Inventory"
            subtitle={`${inventory.length} products across ${activeLocations.length} location(s)`}
            staff={currentStaff}
            activeHref="/inventory"
          />

          <main className="flex-1 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
            {notice ? (
              <p className="rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-[13px] text-warn">
                {notice}
              </p>
            ) : null}

            {/* ---- what is on the shelf, at a glance ---- */}
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Full", value: totalFull.toLocaleString("en-KE"), hint: "ready to sell" },
                { label: "Empty", value: totalEmpty.toLocaleString("en-KE"), hint: "back from customers" },
                {
                  label: "Stock value",
                  value: money(stockValue),
                  hint: "at what each batch cost",
                },
                {
                  label: "Products",
                  value: String(rows.length),
                  hint: showing ? `in ${showing.name}` : branch ? `at ${branch.name}` : "in the catalogue",
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border border-line bg-card px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                >
                  <div className="text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                    {card.label}
                  </div>
                  <div className="mt-1 text-[21px] font-semibold tabular-nums text-ink">
                    {card.value}
                  </div>
                  <div className="text-[11.5px] text-ink-soft/80">{card.hint}</div>
                </div>
              ))}
            </div>

            {/* ---- filter by category ---- */}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/inventory"
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${
                  categoryFilter === ""
                    ? "bg-navy-700 text-white"
                    : "bg-white text-ink ring-1 ring-line hover:bg-canvas"
                }`}
              >
                Everything
              </a>
              {categories.map((category) => (
                <a
                  key={category.id}
                  href={`/inventory?cat=${encodeURIComponent(category.id)}`}
                  className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${
                    categoryFilter === category.id
                      ? "bg-navy-700 text-white"
                      : "bg-white text-ink ring-1 ring-line hover:bg-canvas"
                  }`}
                >
                  {category.name}
                </a>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft">
                Branch
              </span>
              <a
                href={categoryFilter ? `/inventory?cat=${encodeURIComponent(categoryFilter)}` : "/inventory"}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${
                  branchFilter === ""
                    ? "bg-flame-600 text-white"
                    : "bg-white text-ink ring-1 ring-line hover:bg-canvas"
                }`}
              >
                All branches
              </a>
              {activeLocations.map((location) => {
                const query = new URLSearchParams();
                if (categoryFilter) query.set("cat", categoryFilter);
                query.set("branch", location.id);
                return (
                  <a
                    key={location.id}
                    href={`/inventory?${query.toString()}`}
                    className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${
                      branchFilter === location.id
                        ? "bg-flame-600 text-white"
                        : "bg-white text-ink ring-1 ring-line hover:bg-canvas"
                    }`}
                  >
                    {location.name}
                  </a>
                );
              })}
              <span className="ml-auto">
                <NewProductForm
                  categories={categories}
                  brands={brands}
                  startOpen={params.new === "1"}
                />
              </span>
            </div>

            {/* ---- stock by branch ---- */}
            <section className="overflow-hidden rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
                <h2 className="text-[14.5px] font-semibold tracking-tight text-ink">
                  Stock by branch
                </h2>
                <p className="text-[12px] text-ink-soft">
                  Full cylinders are what you can sell today; empties are what came back.
                </p>
              </div>

              {inventory.length === 0 ? (
                <p className="px-5 py-10 text-center text-[13px] text-ink-soft">
                  No products yet. Add the first one above.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left">
                    <thead>
                      <tr className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                        <th className="px-5 py-2.5 font-semibold">Product</th>
                        <th className="px-3 py-2.5 font-semibold">Category</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Full</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Empty</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                        <th className="px-3 py-2.5 text-right font-semibold">
                          Cost
                          <span className="block text-[10px] font-medium normal-case tracking-normal text-ink-soft/70">
                            last buy
                          </span>
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold">Selling price</th>
                        {branch
                          ? null
                          : activeLocations.map((location) => (
                              <th key={location.id} className="px-3 py-2.5 text-right font-semibold">
                                {location.name}
                              </th>
                            ))}
                        <th className="px-5 py-2.5 text-right font-semibold">Stock value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {rows.map((line) => (
                        <tr key={line.variantId} className="text-[13px] hover:bg-canvas/60">
                          <td className="px-5 py-2.5">
                            <a
                              href={`/inventory/${line.variantId}`}
                              className="font-medium text-ink hover:text-flame-600"
                            >
                              {line.variantName}
                            </a>
                            <span className="block text-[11.5px] text-ink-soft/80">
                              {line.brandName}
                              {line.sizeKg ? ` · ${line.sizeKg} kg` : ""}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <Pill tone={line.categoryName === "LPG cylinders" ? "info" : "neutral"}>
                              {line.categoryName}
                            </Pill>
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink">
                            {line.refills}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                            {line.empties}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                            {line.total}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                            {line.lastCost === null ? (
                              <span className="text-ink-soft/50">not bought yet</span>
                            ) : (
                              <>
                                {money(line.lastCost)}
                                {line.lastPurchasedOn ? (
                                  <span className="block text-[11px] text-ink-soft/70">
                                    {line.lastPurchasedOn}
                                  </span>
                                ) : null}
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                            {line.sellingPrice === null ? "—" : money(line.sellingPrice)}
                          </td>
                          {branch
                            ? null
                            : activeLocations.map((location) => {
                                const at = line.byLocation.find(
                                  (b) => b.locationId === location.id,
                                );
                                return (
                                  <td key={location.id} className="px-3 py-2.5 text-right">
                                    {at ? (
                                      <>
                                        <span className="tabular-nums text-ink">{at.refills}</span>
                                        {at.empties > 0 ? (
                                          <span className="block text-[11px] tabular-nums text-ink-soft/70">
                                            {at.empties} e
                                          </span>
                                        ) : null}
                                      </>
                                    ) : (
                                      <span className="text-ink-soft/50">—</span>
                                    )}
                                  </td>
                                );
                              })}
                          <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-ink">
                            {line.costOnHand === 0 ? "—" : money(line.costOnHand)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ---- adding a branch ---- */}
            <section className="rounded-xl border border-line bg-card px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <details>
                <summary className="cursor-pointer text-[13.5px] font-semibold text-ink">
                  Add a branch or a rider van
                </summary>
                <AddLocationForm branches={locations.filter((l) => l.kind === LocationKind.Branch)} />
              </details>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}

function AddLocationForm({ branches }: { branches: StockLocation[] }) {
  return (
    <form action={createLocation} className="mt-3 grid gap-2 sm:grid-cols-[1fr_110px_130px_1fr_1fr_auto]">
      <input
        name="name"
        required
        placeholder="Branch name, e.g. Syokimau"
        className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-flame-500"
      />
      <input
        name="code"
        required
        placeholder="Code"
        className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] uppercase outline-none focus:border-flame-500"
      />
      <select
        name="kind"
        defaultValue="BRANCH"
        className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-flame-500"
      >
        <option value="BRANCH">Branch</option>
        <option value="VAN">Rider van</option>
      </select>
      <select
        name="homeLocationId"
        className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-flame-500"
      >
        <option value="">Branch it belongs to (vans)</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
      <input
        name="rider"
        placeholder="Rider (vans)"
        className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-flame-500"
      />
      <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
    </form>
  );
}
