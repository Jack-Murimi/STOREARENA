import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { ReceiptIcon } from "@/components/icons";
import {
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  SearchInput,
  SegmentedControl,
  StatusBadge,
} from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { formatKsh } from "@/lib/format";
import { listPurchases, listSuppliers, purchaseSummary, type PurchaseRow } from "@/lib/purchases/db";

export const metadata: Metadata = { title: "Purchases" };
export const dynamic = "force-dynamic";

const STATUS_TONE = {
  paid: "ok",
  part_paid: "info",
  overdue: "critical",
  unpaid: "warn",
  void: "neutral",
} as const;

const STATUS_LABEL = {
  paid: "Paid",
  part_paid: "Part paid",
  overdue: "Overdue",
  unpaid: "Unpaid",
  void: "Void",
} as const;

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const str = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const query = str("q");
  const status = str("status");
  const supplierId = str("supplier");
  const branchId = str("branch");
  const showVoid = str("void") === "1";

  const { products, notice, diagnostic } = await getCustomerContext();

  if (!products) {
    return (
      <AppShell
        title="Purchases"
        subtitle="Supplier invoices"
        staff={currentStaff}
        branch={stationName}
        activeHref="/purchases"
      >
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
    );
  }

  const db = products.db;
  const [rows, summary, suppliers] = await Promise.all([
    listPurchases(db, { query, status, supplierId, branchId, showVoid }),
    purchaseSummary(db),
    listSuppliers(db),
  ]);

  const columns: DataColumn<PurchaseRow>[] = [
    {
      key: "date",
      header: "Date",
      num: true,
      priority: 2,
      cell: (r) => r.invoiceDate,
    },
    {
      key: "invoice",
      header: "Invoice",
      priority: 1,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="code block truncate font-medium text-ink">{r.invoiceNo}</span>
          <span className="block truncate text-xs text-ink-subtle">{r.branchName}</span>
        </span>
      ),
    },
    {
      key: "supplier",
      header: "Supplier",
      cell: (r) => <span className="truncate text-ink">{r.supplierName}</span>,
    },
    { key: "total", header: "Total", align: "right", num: true, cell: (r) => formatKsh(r.total) },
    {
      key: "paid",
      header: "Paid",
      align: "right",
      num: true,
      cell: (r) => (r.paid === 0 ? <span className="text-ink-subtle">—</span> : formatKsh(r.paid)),
    },
    {
      key: "due",
      header: "Due",
      align: "right",
      num: true,
      priority: 3,
      cell: (r) =>
        r.due <= 0 ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          <span className="font-semibold text-ink">{formatKsh(r.due)}</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <StatusBadge tone={STATUS_TONE[r.paymentStatus]}>
          {STATUS_LABEL[r.paymentStatus]}
        </StatusBadge>
      ),
    },
    {
      key: "dueDate",
      header: "Due date",
      num: true,
      cell: (r) => r.dueDate ?? <span className="text-ink-subtle">—</span>,
    },
  ];

  return (
    <AppShell
      title="Purchases"
      subtitle="Supplier invoices and what we owe"
      staff={currentStaff}
      branch={stationName}
      activeHref="/purchases"
    >
      <PageHeader
        title="Purchases"
        subtitle="Invoices raised on suppliers, and the stock each one brought in"
        action={
          <ButtonLink href="/purchases/new" variant="primary">
            New invoice
          </ButtonLink>
        }
      />

      {/* compact summary strip — replaces 4 equal-weight KPI cards */}
      <div className="overflow-hidden rounded-xl border border-line bg-card px-5 py-3 shadow-card">
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <div className="flex items-center gap-1.5">
            <dt className="text-xs text-ink-soft">Billed this month</dt>
            <dd className="num font-semibold text-ink">{formatKsh(summary.billedThisMonth)}</dd>
          </div>
          <span aria-hidden className="text-ink-soft/40">·</span>
          <div className="flex items-center gap-1.5">
            <dt className="text-xs text-ink-soft">Paid this month</dt>
            <dd className="num font-semibold text-ink">{formatKsh(summary.paidThisMonth)}</dd>
          </div>
          <span aria-hidden className="text-ink-soft/40">·</span>
          <div className="flex items-center gap-1.5">
            <dt className="text-xs text-ink-soft">Outstanding</dt>
            <dd className={`num font-semibold ${summary.outstanding > 0 ? "text-warn" : "text-ink"}`}>
              {formatKsh(summary.outstanding)}
            </dd>
          </div>
          <span aria-hidden className="text-ink-soft/40">·</span>
          <div className="flex items-center gap-1.5">
            <dt className="text-xs text-ink-soft">Overdue</dt>
            <dd className={`num font-semibold ${summary.overdue > 0 ? "text-critical" : "text-ink-soft"}`}>
              {summary.overdue > 0 ? formatKsh(summary.overdue) : "None"}
            </dd>
          </div>
        </dl>
      </div>

      {/* unified filter bar — single form preserving all params */}
      <FilterBar
        search={
          <form action="/purchases" method="get" role="search" id="purchases-filter">
            <SearchInput
              name="q"
              defaultValue={query}
              placeholder="Invoice no or supplier"
              label="Search purchase invoices"
            />
          </form>
        }
        filters={
          <>
            <SegmentedControl
              label="Status"
              basePath="/purchases"
              paramName="status"
              activeValue={status}
              keep={{ q: query, supplier: supplierId, branch: branchId, ...(showVoid ? { void: "1" } : {}) }}
              options={[
                { value: "", label: "All" },
                { value: "unpaid", label: "Unpaid" },
                { value: "part_paid", label: "Part paid" },
                { value: "paid", label: "Paid" },
                { value: "overdue", label: "Overdue" },
              ]}
            />
            {/* supplier select lives in its own small link-based form to avoid nested form issues */}
            <form action="/purchases" method="get" className="flex items-center gap-2">
              <input type="hidden" name="q" value={query} />
              <input type="hidden" name="status" value={status} />
              <input type="hidden" name="branch" value={branchId} />
              {showVoid ? <input type="hidden" name="void" value="1" /> : null}
              <label className="sr-only" htmlFor="supplier-filter">Filter by supplier</label>
              <select
                id="supplier-filter"
                name="supplier"
                defaultValue={supplierId}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-ink focus:border-orange-500 focus:outline-none"
              >
                <option value="">All suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button type="submit" className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-ink hover:bg-surface-muted">
                Filter
              </button>
            </form>
            <a
              href={voidHref(query, status, supplierId, branchId, showVoid)}
              className="inline-flex h-9 items-center rounded-md border border-border px-2.5 text-sm text-ink-muted hover:bg-surface-muted"
            >
              {showVoid ? "Hide void" : "Show void"}
            </a>
          </>
        }
      />

      <Card
        title="Invoices"
        subtitle={showVoid ? "Including voided" : "Voided rows are hidden"}
        flush
      >
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          rowHref={(r) => `/purchases/${r.id}`}
          rowLabel={(r) => r.invoiceNo}
          empty={
            <EmptyState
              icon={ReceiptIcon}
              title={rows.length === 0 && !query && !status ? "No purchase invoices yet" : "Nothing matches this filter"}
              description={
                query || status || supplierId
                  ? "Try a different search, or clear the filters."
                  : "Record the first invoice from a supplier to start tracking what you owe."
              }
              action={
                query || status || supplierId ? (
                  <ButtonLink href="/purchases">Clear filters</ButtonLink>
                ) : (
                  <ButtonLink href="/purchases/new" variant="primary">
                    New invoice
                  </ButtonLink>
                )
              }
            />
          }
        />
      </Card>
    </AppShell>
  );
}

function voidHref(q: string, status: string, supplier: string, branch: string, showing: boolean) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (status) p.set("status", status);
  if (supplier) p.set("supplier", supplier);
  if (branch) p.set("branch", branch);
  if (!showing) p.set("void", "1");
  const s = p.toString();
  return `/purchases${s ? `?${s}` : ""}`;
}
