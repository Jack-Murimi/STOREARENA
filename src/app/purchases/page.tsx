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
  KpiCard,
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Billed this month" value={formatKsh(summary.billedThisMonth)} />
        <KpiCard label="Paid this month" value={formatKsh(summary.paidThisMonth)} />
        <KpiCard label="Outstanding" value={formatKsh(summary.outstanding)} />
        <KpiCard
          label="Overdue"
          value={formatKsh(summary.overdue)}
          subtext={summary.overdue > 0 ? "past due date" : "nothing past due"}
          chip={
            summary.overdue > 0 ? <StatusBadge tone="critical">Chase</StatusBadge> : undefined
          }
        />
      </div>

      <FilterBar
        search={
          <form action="/purchases" method="get" role="search">
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="supplier" value={supplierId} />
            <input type="hidden" name="branch" value={branchId} />
            {showVoid ? <input type="hidden" name="void" value="1" /> : null}
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
            <form action="/purchases" method="get" className="flex items-center gap-2">
              <input type="hidden" name="q" value={query} />
              <input type="hidden" name="status" value={status} />
              <input type="hidden" name="branch" value={branchId} />
              {showVoid ? <input type="hidden" name="void" value="1" /> : null}
              <label className="sr-only" htmlFor="supplier">
                Filter by supplier
              </label>
              <select
                id="supplier"
                name="supplier"
                defaultValue={supplierId}
                onChange={undefined}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-ink focus:border-orange-500 focus:outline-none"
              >
                <option value="">All suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
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
