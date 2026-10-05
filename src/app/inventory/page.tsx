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
  const saved = typeof params.saved === "string" ? params.saved : null;
  const error = typeof params.error === "string" ? params.error : null;

  const { products, notice, diagnostic } = await getCustomerContext();

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

  const [categories, brands, locations, inventory] = await Promise.all([
    products.listCategories(),
    products.listBrands(),
    products.listLocations(),
    products.listInventory({ categoryId: categoryFilter || null }),
  ]);

  const activeLocations = locations.filter((l) => l.active);
  const showing = categoryFilter
    ? categories.find((c) => c.id === categoryFilter)
    : null;

  const totalCylinders = inventory.reduce((sum, line) => sum + line.cylinders, 0);
  const totalRefills = inventory.reduce((sum, line) => sum + line.refills, 0);

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
                { label: "Products", value: String(inventory.length), hint: showing ? `in ${showing.name}` : "in the catalogue" },
                { label: "Brands", value: String(brands.length), hint: "stocked" },
                { label: "Cylinders", value: totalCylinders.toLocaleString("en-KE"), hint: "refills plus empties" },
                { label: "Full cylinders", value: totalRefills.toLocaleString("en-KE"), hint: "ready to sell" },
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
                  <table className="w-full min-w-[760px] text-left">
                    <thead>
                      <tr className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                        <th className="px-5 py-2.5 font-semibold">Product</th>
                        <th className="px-3 py-2.5 font-semibold">Category</th>
                        <th className="px-3 py-2.5 font-semibold">Code</th>
                        <th className="px-3 py-2.5 text-right font-semibold">List price</th>
                        {activeLocations.map((location) => (
                          <th key={location.id} className="px-3 py-2.5 text-right font-semibold">
                            {location.name}
                            <span className="block text-[10px] font-medium normal-case tracking-normal text-ink-soft/70">
                              {location.kind === LocationKind.Van
                                ? `van · ${location.rider ?? ""}`
                                : "branch"}
                            </span>
                          </th>
                        ))}
                        <th className="px-5 py-2.5 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {inventory.map((line) => (
                        <tr key={line.variant.id} className="text-[13px] hover:bg-canvas/60">
                          <td className="px-5 py-2.5">
                            <span className="font-medium text-ink">{line.variant.name}</span>
                            <span className="block text-[11.5px] text-ink-soft/80">
                              {line.brandName}
                              {line.variant.sizeKg ? ` · ${line.variant.sizeKg} kg` : ""}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <Pill tone={line.categoryName === "LPG cylinders" ? "info" : "neutral"}>
                              {line.categoryName}
                            </Pill>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11.5px] text-ink-soft">
                            {line.variant.code}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                            {line.variant.listPriceKsh
                              ? `KSh ${line.variant.listPriceKsh.toLocaleString("en-KE")}`
                              : "—"}
                          </td>
                          {activeLocations.map((location) => {
                            const at = line.byLocation.find((b) => b.locationId === location.id);
                            return (
                              <td key={location.id} className="px-3 py-2.5 text-right">
                                {at ? (
                                  <>
                                    <span className="font-semibold tabular-nums text-ink">
                                      {at.refills}
                                    </span>
                                    {at.empties > 0 ? (
                                      <span className="block text-[11px] tabular-nums text-ink-soft/80">
                                        {at.empties} empty
                                      </span>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className="text-ink-soft/50">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-5 py-2.5 text-right">
                            <span className="font-semibold tabular-nums text-ink">
                              {line.refills}
                            </span>
                            {line.empties > 0 ? (
                              <span className="block text-[11px] tabular-nums text-ink-soft/80">
                                + {line.empties} empty
                              </span>
                            ) : null}
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
