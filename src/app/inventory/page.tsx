import type { Metadata } from "next";
import { createLocation } from "./actions";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { SavedToast } from "@/components/customers/SavedToast";
import { SubmitButton } from "@/components/customers/SubmitButton";
import { NewProductForm } from "@/components/inventory/NewProductForm";
import {
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  SegmentedControl,
  StatusBadge,
} from "@/components/ui";
import type { DataColumn, DataGroup } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { formatKsh } from "@/lib/format";
import { LocationKind } from "@/lib/stock/types";
import type { StockLocation } from "@/lib/stock/types";
import type { StockRow } from "@/lib/stock/stock-db";
import { CylinderIcon, SearchIcon } from "@/components/icons";

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
  const str = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";
  const categoryFilter = str("cat");
  const branchFilter = str("branch");
  const query = str("q").trim().toLowerCase();
  const saved = str("saved") || null;
  const error = str("error") || null;

  const { products, stock, notice, diagnostic } = await getCustomerContext();

  if (!products) {
    return (
      <AppShell
        title="Inventory"
        subtitle="Products and stock"
        staff={currentStaff}
        branch={stationName}
        activeHref="/inventory"
      >
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
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

  /* ---- filtering -------------------------------------------------------
     Zero-stock rows are hidden by default. A catalogue with 69 products where
     most are accessories nobody holds makes the list hard to read; the useful
     rows are the ones with stock on them. ?zero=1 brings the rest back. */
  const showZero = str("zero") === "1";

  const filtered = inventory.filter((line) => {
    if (categoryFilter && line.categoryId !== categoryFilter) return false;
    if (!showZero && line.total === 0) return false;
    if (!query) return true;
    return (
      line.variantName.toLowerCase().includes(query) ||
      line.brandName.toLowerCase().includes(query)
    );
  });

  const groups: DataGroup<StockRow>[] = categories
    .map((category) => {
      const rows = filtered.filter((line) => line.categoryId === category.id);
      const value = rows.reduce((sum, line) => sum + line.costOnHand, 0);
      return {
        key: category.id,
        label: category.name,
        meta: `${rows.length} product${rows.length === 1 ? "" : "s"}`,
        subtotal: value === 0 ? "—" : formatKsh(value),
        rows,
      };
    })
    .filter((group) => group.rows.length > 0);

  const shown = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const totalFull = filtered.reduce((sum, line) => sum + line.refills, 0);
  const totalEmpty = filtered.reduce((sum, line) => sum + line.empties, 0);
  const stockValue = filtered.reduce((sum, line) => sum + line.costOnHand, 0);

  const columns: DataColumn<StockRow>[] = [
    {
      key: "product",
      header: "Product",
      priority: 1,
      cell: (line) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-ink">{line.variantName}</span>
          <span className="block truncate text-xs text-ink-subtle">
            {line.brandName}
            {line.sizeKg ? ` · ${line.sizeKg} kg` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "refills",
      header: "Full",
      align: "right",
      num: true,
      priority: 2,
      cell: (line) => (
        <span className="font-semibold text-ink">{line.refills}</span>
      ),
    },
    { key: "empties", header: "Empty", align: "right", num: true, cell: (l) => l.empties },
    { key: "total", header: "Total", align: "right", num: true, cell: (l) => l.total },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      num: true,
      cell: (line) =>
        line.lastCost === null ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          <span className="block">
            {formatKsh(line.lastCost)}
            {line.lastPurchasedOn ? (
              <span className="block text-xs text-ink-subtle">{line.lastPurchasedOn}</span>
            ) : null}
          </span>
        ),
    },
    {
      key: "price",
      header: "Sells at",
      align: "right",
      num: true,
      cell: (line) =>
        line.sellingPrice === null ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          formatKsh(line.sellingPrice)
        ),
    },
    {
      key: "branches",
      header: "Per branch",
      /* One disclosure rather than four always-present columns: with four
         branches that was 30% of the table's width holding mostly dashes. */
      cell: (line) => {
        const held = line.byLocation.filter((b) => b.refills > 0 || b.empties > 0);
        if (held.length === 0) return <span className="text-ink-subtle">—</span>;
        return (
          <details className="group">
            <summary className="cursor-pointer list-none whitespace-nowrap text-sm text-orange-700 group-open:text-ink">
              {held.length} branch{held.length === 1 ? "" : "es"}
            </summary>
            <ul className="mt-1 space-y-0.5 text-xs text-ink-muted">
              {held.map((at) => {
                const place = activeLocations.find((l) => l.id === at.locationId);
                return (
                  <li key={at.locationId} className="num whitespace-nowrap">
                    {place?.name ?? at.locationId}: {at.refills} full, {at.empties} empty
                  </li>
                );
              })}
            </ul>
          </details>
        );
      },
    },
    {
      key: "value",
      header: "Stock value",
      align: "right",
      num: true,
      priority: 3,
      cell: (line) =>
        line.costOnHand === 0 ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          <span className="font-semibold text-ink">{formatKsh(line.costOnHand)}</span>
        ),
    },
  ];

  return (
    <>
      <SavedToast key={saved ?? error ?? "none"} message={saved ?? error} tone={error ? "bad" : "good"} />
      <AppShell
        title="Inventory"
        subtitle={`${inventory.length} products · ${activeLocations.length} locations`}
        staff={currentStaff}
        branch={branch?.name ?? stationName}
        activeHref="/inventory"
      >
        <PageHeader
          title="Inventory"
          subtitle={
            branch ? `Stock at ${branch.name}` : "Every product, across every location"
          }
          action={
            <ButtonLink href="/inventory?new=1" variant="primary">
              New product
            </ButtonLink>
          }
          /* Admin-ish, rarely used: behind a gear, not a second button. */
          menu={
            <details className="relative">
              <summary
                className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-md border border-border text-ink-muted hover:bg-surface-muted"
                aria-label="Manage locations"
              >
                <GearIcon />
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-[min(90vw,560px)] rounded-lg border border-border bg-surface p-4 shadow-raised">
                <h2 className="text-base font-semibold text-ink">Add a branch or a rider van</h2>
                <p className="mb-3 text-xs text-ink-subtle">
                  Rider vans hold stock too, so they belong here rather than on a separate screen.
                </p>
                <AddLocationForm
                  branches={locations.filter((l) => l.kind === LocationKind.Branch)}
                />
              </div>
            </details>
          }
        />

        {notice ? (
          <StatusBadge tone="warn">{notice}</StatusBadge>
        ) : null}

        {/* A single line of figures, not four cards. */}
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-surface px-4 py-2.5">
          <SummaryStat label="Full" value={totalFull.toLocaleString("en-KE")} />
          <SummaryStat label="Empty" value={totalEmpty.toLocaleString("en-KE")} />
          <SummaryStat label="Stock value" value={formatKsh(stockValue)} hint="at cost" />
          <SummaryStat label="Products" value={String(shown)} hint={showZero ? "shown" : "with stock"} />
        </dl>

        <FilterBar
          search={
            <form action="/inventory" method="get" role="search" className="w-full sm:w-64">
              <input type="hidden" name="cat" value={categoryFilter} />
              <input type="hidden" name="branch" value={branchFilter} />
              {showZero ? <input type="hidden" name="zero" value="1" /> : null}
              <label className="relative block">
                <span className="sr-only">Search products by name or brand</span>
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder="Search products…"
                  className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-2 text-sm text-ink placeholder:text-ink-subtle focus:border-orange-500 focus:outline-none"
                />
              </label>
            </form>
          }
          filters={
            <>
              <SegmentedControl
                label="Category"
                basePath="/inventory"
                paramName="cat"
                activeValue={categoryFilter}
                keep={{ branch: branchFilter, q: query, ...(showZero ? { zero: "1" } : {}) }}
                options={[
                  { value: "", label: "All" },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              <SegmentedControl
                label="Location"
                basePath="/inventory"
                paramName="branch"
                activeValue={branchFilter}
                keep={{ cat: categoryFilter, q: query, ...(showZero ? { zero: "1" } : {}) }}
                options={[
                  { value: "", label: "All locations" },
                  ...activeLocations.map((l) => ({ value: l.id, label: l.name })),
                ]}
              />
              <a
                href={zeroHref(categoryFilter, branchFilter, query, showZero)}
                className="inline-flex h-9 items-center whitespace-nowrap rounded-md border border-border px-2.5 text-sm text-ink-muted hover:bg-surface-muted"
              >
                {showZero ? "Hide zero stock" : "Show zero stock"}
              </a>
            </>
          }
        />

        {params.new === "1" ? (
          <Card title="New product">
            <NewProductForm
              categories={categories}
              brands={brands}
              startOpen
            />
          </Card>
        ) : null}

        <Card
          title="Stock"
          subtitle={
            showZero
              ? "Grouped by category, including products with none on hand"
              : "Grouped by category · products with nothing on hand are hidden"
          }
          flush
        >
          <DataTable
            groups={groups}
            columns={columns}
            rowKey={(line) => line.variantId}
            rowHref={(line) => `/inventory/${line.variantId}`}
            empty={
              <EmptyState
                icon={CylinderIcon}
                title={inventory.length === 0 ? "No products yet" : "Nothing matches this filter"}
                description={
                  inventory.length === 0
                    ? "Add the first product to start tracking stock against it."
                    : showZero
                      ? "Try a different category or location, or clear the search."
                      : "Nothing here has stock on it. Turn on zero stock to see the whole catalogue."
                }
                action={
                  inventory.length === 0 ? (
                    <ButtonLink href="/inventory?new=1" variant="primary">
                      New product
                    </ButtonLink>
                  ) : !showZero ? (
                    <ButtonLink href={zeroHref(categoryFilter, branchFilter, query, false)}>
                      Show zero stock
                    </ButtonLink>
                  ) : null
                }
              />
            }
          />
        </Card>
      </AppShell>
    </>
  );
}

function SummaryStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="num text-md font-semibold text-ink">
        {value}
        {hint ? <span className="ml-1.5 text-xs font-normal text-ink-subtle">{hint}</span> : null}
      </dd>
    </div>
  );
}

function zeroHref(cat: string, branch: string, q: string, currentlyShowing: boolean) {
  const query = new URLSearchParams();
  if (cat) query.set("cat", cat);
  if (branch) query.set("branch", branch);
  if (q) query.set("q", q);
  if (!currentlyShowing) query.set("zero", "1");
  const suffix = query.toString();
  return `/inventory${suffix ? `?${suffix}` : ""}`;
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.6v1.9M10 15.5v1.9M17.4 10h-1.9M4.5 10H2.6M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4M15.2 15.2l-1.4-1.4M6.2 6.2L4.8 4.8" />
    </svg>
  );
}

function AddLocationForm({ branches }: { branches: StockLocation[] }) {
  return (
    <form action={createLocation} className="grid gap-2 sm:grid-cols-2">
      <input
        name="name"
        required
        placeholder="Branch name, e.g. Syokimau"
        className="h-9 rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus:border-orange-500"
      />
      <input
        name="code"
        required
        placeholder="Code"
        className="h-9 rounded-md border border-border bg-surface px-2.5 text-sm uppercase outline-none focus:border-orange-500"
      />
      <select
        name="kind"
        defaultValue="BRANCH"
        className="h-9 rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-orange-500"
      >
        <option value="BRANCH">Branch</option>
        <option value="VAN">Rider van</option>
      </select>
      <select
        name="homeLocationId"
        className="h-9 rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-orange-500"
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
        className="h-9 rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus:border-orange-500 sm:col-span-2"
      />
      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Adding…">Add location</SubmitButton>
      </div>
    </form>
  );
}
