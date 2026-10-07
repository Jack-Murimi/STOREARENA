import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import {
  DataTable, EmptyState, FilterBar, KpiCard, PageHeader, SearchInput, SegmentedControl,
} from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { formatKsh } from "@/lib/format";
import { listSupplierDirectory, type Supplier } from "@/lib/purchases/db";

export const metadata: Metadata = { title: "Suppliers" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const columns: DataColumn<Supplier>[] = [
  {
    key: "name",
    header: "Supplier",
    priority: 1,
    cell: (s) => (
      <span className="flex items-center gap-2">
        <span className="font-medium text-[var(--text-primary)]">{s.name}</span>
        {!s.isActive && (
          <span className="rounded-full border border-[var(--line)] bg-[var(--surface-muted)] px-2 py-0.5 text-[var(--text-xs)] text-[var(--text-tertiary)]">
            inactive
          </span>
        )}
      </span>
    ),
  },
  {
    key: "contact",
    header: "Contact",
    priority: 3,
    cell: (s) => (
      <span className="text-[var(--text-secondary)]">{s.phone ?? s.email ?? "—"}</span>
    ),
  },
  { key: "terms", header: "Terms", align: "right", num: true, priority: 3, cell: (s) => `${s.paymentTermsDays}d` },
  { key: "invoices", header: "Invoices", align: "right", num: true, priority: 2, cell: (s) => s.invoices.toLocaleString("en-KE") },
  {
    key: "billed",
    header: "Total billed",
    align: "right", num: true, priority: 2,
    cell: (s) => <span className="text-[var(--text-secondary)]">{formatKsh(s.totalBilled)}</span>,
  },
  {
    key: "balance",
    header: "We owe",
    align: "right", num: true, priority: 1,
    cell: (s) => (
      <span className={s.balance > 0 ? "font-medium text-[var(--warn)]" : "text-[var(--text-tertiary)]"}>
        {formatKsh(s.balance)}
      </span>
    ),
  },
  {
    key: "age",
    header: "Oldest open",
    align: "right", num: true, priority: 3,
    cell: (s) =>
      s.oldestOpenDays === null ? (
        <span className="text-[var(--text-tertiary)]">—</span>
      ) : (
        <span className={s.oldestOpenDays > 30 ? "text-[var(--critical)]" : "text-[var(--text-secondary)]"}>
          {s.oldestOpenDays}d
        </span>
      ),
  },
];

export default async function SuppliersPage({ searchParams }: Props) {
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : "";
  const showInactive = params.inactive === "1";

  const { products, notice, diagnostic } = await getCustomerContext();

  if (!products) {
    return (
      <AppShell title="Suppliers" staff={currentStaff} branch={stationName} activeHref="/suppliers">
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
    );
  }

  const all = await listSupplierDirectory(products.db, undefined, true);
  const rows = await listSupplierDirectory(products.db, search, showInactive);

  const outstanding = all.reduce((sum, s) => sum + s.balance, 0);
  const billed = all.reduce((sum, s) => sum + s.totalBilled, 0);
  const owed = all.filter((s) => s.balance > 0).length;

  return (
    <AppShell title="Suppliers" subtitle="Everyone you buy from" staff={currentStaff} branch={stationName} activeHref="/suppliers">
      <PageHeader
        title="Suppliers"
        subtitle="Balances come straight from the invoice ledger"
        action={<Link href="/suppliers/new" className="inline-flex h-[var(--touch-target)] items-center gap-2 rounded-lg bg-[var(--orange-500)] px-4 text-[var(--text-sm)] font-semibold text-[var(--text-on-orange)] hover:bg-[var(--orange-600)]">Add supplier</Link>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Suppliers" value={String(all.length)} subtext={`${all.filter((s) => s.isActive).length} active`} />
        <KpiCard label="Total billed" value={formatKsh(billed)} subtext="All time" />
        <KpiCard label="Outstanding" value={formatKsh(outstanding)} subtext={`${owed} supplier${owed === 1 ? "" : "s"} to pay`} />
      </div>

      <FilterBar
        search={
          <form action="/suppliers" method="get" role="search">
            <input type="hidden" name="inactive" value={showInactive ? "1" : ""} />
            <SearchInput
              name="search"
              defaultValue={search}
              placeholder="Name, phone or email"
              label="Search suppliers"
            />
          </form>
        }
        filters={
          <SegmentedControl
            label="Status"
            basePath="/suppliers"
            paramName="inactive"
            activeValue={showInactive ? "1" : ""}
            options={[
              { value: "", label: "Active" },
              { value: "1", label: "All" },
            ]}
          />
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        rowHref={(s) => `/suppliers/${s.id}`}
        caption="Suppliers"
        empty={
          <EmptyState
            title="No suppliers yet"
            description="Add the distributors you buy from and you can raise purchase invoices against them."
            action={<Link href="/suppliers/new" className="inline-flex h-[var(--touch-target)] items-center rounded-lg bg-[var(--orange-500)] px-4 text-[var(--text-sm)] font-semibold text-[var(--text-on-orange)] hover:bg-[var(--orange-600)]">Add supplier</Link>}
          />
        }
      />
    </AppShell>
  );
}
