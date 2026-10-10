import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { ButtonLink, Card, DataTable, EmptyState, KpiCard, PageHeader, StatusBadge } from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { ReceiptIcon } from "@/components/icons";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { formatKsh } from "@/lib/format";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

type ReportSale = {
  id: string;
  receiptNo: string;
  saleDate: string;
  branchName: string;
  customerName: string | null;
  riderName: string | null;
  saleType: "counter" | "delivery";
  paymentMethods: string[];
  total: number;
  paid: number;
  due: number;
  status: "posted" | "void";
};

type Branch = { id: string; name: string; code: string };
type ReportKind = "sales" | "customers" | "inventory" | "purchases" | "deliveries";
const reportKinds: { id: ReportKind; label: string; description: string }[] = [
  { id: "sales", label: "Sales", description: "Receipts, revenue, collection, and credit" },
  { id: "customers", label: "Customers", description: "Current customer balances and account activity" },
  { id: "inventory", label: "Inventory", description: "Stock on hand by branch, product, and state" },
  { id: "purchases", label: "Purchases", description: "Supplier invoices and branch buying" },
  { id: "deliveries", label: "Deliveries", description: "Rider delivery performance and value" },
];
type Rider = { id: string; name: string; branchId: string; active: boolean };
const text = (value: unknown): string => value === null || value === undefined ? "" : String(value);
const money = (value: unknown): number => Number(value ?? 0);

function dateInput(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(date);
}
function safeDate(value: string, fallback: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}
function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date(value));
}
const paymentNames: Record<string, string> = { cash: "Cash", mpesa: "M-Pesa", bank: "Bank", card: "Card", credit: "Credit" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const get = (name: string): string => typeof params[name] === "string" ? params[name] : "";
  const now = new Date();
  const today = dateInput(now);
  const thirtyDaysAgo = dateInput(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
  const requestedReport = get("report");
  const report: ReportKind = reportKinds.some((entry) => entry.id === requestedReport) ? requestedReport as ReportKind : "sales";
  const branchId = get("branch");
  const customerId = get("customer");
  const lookup = get("q").trim();
  const from = safeDate(get("from"), thirtyDaysAgo);
  const to = safeDate(get("to"), today);
  const riderId = get("rider");
  const saleType = get("type") === "delivery" || get("type") === "counter" ? get("type") : "";
  const payment = ["cash", "mpesa", "bank", "card", "credit"].includes(get("payment")) ? get("payment") : "";
  const status = get("status") === "void" ? "void" : get("status") === "all" ? "all" : "posted";
  const { products, notice, diagnostic } = await getCustomerContext();

  if (!products) {
    return <AppShell title="Reports" subtitle="Sales reporting" staff={currentStaff} branch={stationName} activeHref="/reports"><DatabaseUnavailable notice={notice} diagnostic={diagnostic} /></AppShell>;
  }

  const [branchRows, customerRows, riderRows, saleRows] = await Promise.all([
    products.db.query<Record<string, unknown>>("select id, name, code from stock_locations where kind = 'BRANCH' and active order by name"),
    products.db.query<Record<string, unknown>>("select id, name from customers order by name"),
    products.db.query<Record<string, unknown>>("select id, name, branch_id, is_active from riders order by is_active desc, name"),
    products.db.query<Record<string, unknown>>(
      `select s.id, s.receipt_no, s.sale_date, s.sale_type, s.status,
              b.name as branch_name, c.name as customer_name, r.name as rider_name,
              s.total, s.amount_paid, s.balance_due,
              coalesce(array_agg(distinct p.method) filter (where p.method is not null), '{}') as payment_methods
         from sales s
         join stock_locations b on b.id = s.branch_id
    left join customers c on c.id = s.customer_id
    left join riders r on r.id = s.rider_id
    left join sale_payments p on p.sale_id = s.id
        where ($1 = '' or s.branch_id = $1)
          and s.sale_date >= $2::date
          and s.sale_date < ($3::date + interval '1 day')
          and ($4 = '' or s.rider_id::text = $4)
          and ($5 = '' or s.sale_type = $5)
          and ($6 = 'all' or s.status = $6)
          and ($7 = '' or exists (select 1 from sale_payments match_payment where match_payment.sale_id = s.id and match_payment.method = $7))
          and ($8 = '' or s.customer_id = $8)
          and ($9 = '' or s.receipt_no ilike '%' || $9 || '%'
               or c.name ilike '%' || $9 || '%'
               or exists (select 1 from invoices i where i.sale_id = s.id::text and i.reference ilike '%' || $9 || '%')
               or exists (select 1 from sale_payments lookup_payment where lookup_payment.sale_id = s.id and coalesce(lookup_payment.reference, '') ilike '%' || $9 || '%'))
        group by s.id, b.name, c.name, r.name
        order by s.sale_date desc
        limit 500`,
      [branchId, from, to, riderId, saleType, status, payment, customerId, lookup],
    ),
  ]);

  const branches: Branch[] = branchRows.map((row) => ({ id: text(row.id), name: text(row.name), code: text(row.code) }));
  const customers = customerRows.map((row) => ({ id: text(row.id), name: text(row.name) }));
  const riders: Rider[] = riderRows.map((row) => ({ id: text(row.id), name: text(row.name), branchId: text(row.branch_id), active: row.is_active === true || row.is_active === "t" }));
  const sales: ReportSale[] = saleRows.map((row) => ({
    id: text(row.id), receiptNo: text(row.receipt_no), saleDate: text(row.sale_date), branchName: text(row.branch_name),
    customerName: row.customer_name ? text(row.customer_name) : null, riderName: row.rider_name ? text(row.rider_name) : null,
    saleType: row.sale_type === "delivery" ? "delivery" : "counter", paymentMethods: Array.isArray(row.payment_methods) ? row.payment_methods.map(text) : [],
    total: money(row.total), paid: money(row.amount_paid), due: money(row.balance_due), status: row.status === "void" ? "void" : "posted",
  }));
  const posted = sales.filter((sale) => sale.status === "posted");
  const revenue = posted.reduce((sum, sale) => sum + sale.total, 0);
  const paid = posted.reduce((sum, sale) => sum + sale.paid, 0);
  const due = posted.reduce((sum, sale) => sum + sale.due, 0);
  const deliveries = posted.filter((sale) => sale.saleType === "delivery").length;

  const columns: DataColumn<ReportSale>[] = [
    { key: "receipt", header: "Receipt", priority: 1, cell: (sale) => <span className="code font-semibold text-ink">{sale.receiptNo}</span> },
    { key: "date", header: "Date", priority: 2, cell: (sale) => <span className="text-ink-subtle">{displayDate(sale.saleDate)}</span> },
    { key: "branch", header: "Branch", priority: 2, cell: (sale) => sale.branchName },
    { key: "customer", header: "Customer", priority: 1, cell: (sale) => sale.customerName ?? "Walk-in" },
    { key: "rider", header: "Rider", priority: 3, cell: (sale) => sale.riderName ?? "—" },
    { key: "type", header: "Type", priority: 3, cell: (sale) => <span className="capitalize">{sale.saleType}</span> },
    { key: "payment", header: "Payment", priority: 3, cell: (sale) => sale.paymentMethods.length ? sale.paymentMethods.map((method) => paymentNames[method] ?? method).join(", ") : sale.due > 0 ? "Credit" : "—" },
    { key: "total", header: "Total", align: "right", num: true, priority: 1, cell: (sale) => <span className="font-semibold">{formatKsh(sale.total)}</span> },
    { key: "status", header: "Status", priority: 3, cell: (sale) => sale.status === "void" ? <StatusBadge tone="neutral">Void</StatusBadge> : sale.due > 0 ? <StatusBadge tone="warn">Credit due</StatusBadge> : <StatusBadge tone="ok">Paid</StatusBadge> },
  ];

  const exportHref = `/api/reports/export?report=${report}&branch=${encodeURIComponent(branchId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&customer=${encodeURIComponent(customerId)}&rider=${encodeURIComponent(riderId)}&type=${encodeURIComponent(saleType)}&payment=${encodeURIComponent(payment)}&status=${encodeURIComponent(status)}&q=${encodeURIComponent(lookup)}`;
  const reportNavigation = <nav aria-label="Report category" className="flex flex-wrap gap-2">{reportKinds.map((entry) => <a key={entry.id} href={`/reports?report=${entry.id}&branch=${encodeURIComponent(branchId)}&from=${from}&to=${to}`} className={`rounded-pill border px-3 py-2 text-sm font-medium ${report === entry.id ? "border-orange-500 bg-orange-500 text-ink" : "border-border bg-surface text-ink-muted hover:bg-surface-muted"}`}>{entry.label}</a>)}</nav>;
  const baseFilters = <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input type="hidden" name="report" value={report} /><label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Branch</span><select name="branch" defaultValue={branchId} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>)}</select></label><label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">From</span><input type="date" name="from" defaultValue={from} max={to} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm" /></label><label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">To</span><input type="date" name="to" defaultValue={to} min={from} max={today} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm" /></label><div className="flex items-end gap-2"><button type="submit" className="h-10 rounded-md bg-orange-500 px-4 text-sm font-semibold text-ink hover:bg-orange-400">Apply filters</button><a href={`/reports?report=${report}`} className="inline-flex h-10 items-center px-2 text-sm font-medium text-orange-700 hover:underline">Reset</a></div></form>;

  if (report !== "sales") {
    let content: ReactNode;
    let title = "";
    let subtitle = "";
    if (report === "customers") {
      const rows = await products.db.query<Record<string, unknown>>(`select c.id, c.name, c.code, coalesce(v.invoiced, 0) as invoiced, coalesce(v.paid, 0) as paid, coalesce(v.balance, 0) as balance, coalesce(v.invoice_count, 0) as invoice_count from customers c left join v_customer_balance v on v.id = c.id order by balance desc, c.name`);
      const totalBalance = rows.reduce((sum, row) => sum + money(row.balance), 0);
      title = "Customer balances"; subtitle = "Live balances are company-wide; they are not limited to a branch.";
      content = <><div className="grid gap-4 sm:grid-cols-3"><KpiCard label="Customers" value={String(rows.length)} /><KpiCard label="Outstanding" value={formatKsh(totalBalance)} /><KpiCard label="Invoiced" value={formatKsh(rows.reduce((sum, row) => sum + money(row.invoiced), 0))} /></div><Card title="Customer account report" flush><DataTable rows={rows} rowKey={(row) => text(row.id)} columns={[{ key: "customer", header: "Customer", priority: 1, cell: (row) => <span><span className="block font-medium">{text(row.name)}</span><span className="code text-xs text-ink-subtle">{text(row.code)}</span></span> }, { key: "invoices", header: "Invoices", align: "right", num: true, priority: 2, cell: (row) => Number(row.invoice_count ?? 0) }, { key: "invoiced", header: "Invoiced", align: "right", num: true, priority: 3, cell: (row) => formatKsh(money(row.invoiced)) }, { key: "paid", header: "Paid", align: "right", num: true, priority: 3, cell: (row) => formatKsh(money(row.paid)) }, { key: "balance", header: "Balance", align: "right", num: true, priority: 1, cell: (row) => <span className="font-semibold">{formatKsh(money(row.balance))}</span> }]} empty={<EmptyState icon={ReceiptIcon} title="No customer accounts" description="Customer balances will appear after invoices and payments are recorded." />} /></Card></>;
    } else if (report === "inventory") {
      const rows = await products.db.query<Record<string, unknown>>(`select l.name as branch_name, pv.id, pv.name as product_name, b.name as brand_name, pv.size_kg, coalesce(sum(p.quantity) filter (where p.state = 'REFILL'), 0) as refills, coalesce(sum(p.quantity) filter (where p.state = 'EMPTY'), 0) as empties from inventory_positions p join stock_locations l on l.id = p.location_id join product_variants pv on pv.id = p.variant_id join brands b on b.id = pv.brand_id where ($1 = '' or p.location_id = $1) group by l.name, pv.id, b.name order by l.name, pv.size_kg nulls last, pv.name`, [branchId]);
      title = "Inventory on hand"; subtitle = "Current physical stock by branch. Date filters do not alter a current stock position.";
      content = <><div className="grid gap-4 sm:grid-cols-3"><KpiCard label="Refills on hand" value={String(rows.reduce((sum, row) => sum + Number(row.refills ?? 0), 0))} /><KpiCard label="Empty cylinders" value={String(rows.reduce((sum, row) => sum + Number(row.empties ?? 0), 0))} /><KpiCard label="Products represented" value={String(new Set(rows.map((row) => text(row.id))).size)} /></div><Card title="Stock by branch" flush><DataTable rows={rows} rowKey={(row) => `${text(row.branch_name)}-${text(row.id)}`} columns={[{ key: "product", header: "Product", priority: 1, cell: (row) => <span><span className="block font-medium">{text(row.product_name)}</span><span className="text-xs text-ink-subtle">{text(row.brand_name)}{row.size_kg ? ` · ${text(row.size_kg)} kg` : ""}</span></span> }, { key: "branch", header: "Branch", priority: 2, cell: (row) => text(row.branch_name) }, { key: "refills", header: "Refills", align: "right", num: true, priority: 2, cell: (row) => Number(row.refills ?? 0) }, { key: "empties", header: "Empties", align: "right", num: true, priority: 3, cell: (row) => Number(row.empties ?? 0) }]} empty={<EmptyState icon={ReceiptIcon} title="No stock position" description="No stock is recorded for this branch selection." />} /></Card></>;
    } else if (report === "purchases") {
      const rows = await products.db.query<Record<string, unknown>>(`select p.id, p.invoice_no, p.invoice_date, p.status, p.total, s.name as supplier_name, b.name as branch_name from purchase_invoices p join suppliers s on s.id = p.supplier_id join stock_locations b on b.id = p.branch_id where ($1 = '' or p.branch_id = $1) and p.invoice_date >= $2::date and p.invoice_date <= $3::date order by p.invoice_date desc limit 500`, [branchId, from, to]);
      const postedRows = rows.filter((row) => text(row.status) === "posted");
      title = "Purchase report"; subtitle = "Supplier invoices and spend for the chosen branch and date range.";
      content = <><div className="grid gap-4 sm:grid-cols-3"><KpiCard label="Posted invoices" value={String(postedRows.length)} /><KpiCard label="Purchase spend" value={formatKsh(postedRows.reduce((sum, row) => sum + money(row.total), 0))} /><KpiCard label="Suppliers" value={String(new Set(postedRows.map((row) => text(row.supplier_name))).size)} /></div><Card title="Supplier purchase invoices" flush><DataTable rows={rows} rowKey={(row) => text(row.id)} columns={[{ key: "invoice", header: "Invoice", priority: 1, cell: (row) => <span className="code font-semibold">{text(row.invoice_no)}</span> }, { key: "date", header: "Date", priority: 2, cell: (row) => text(row.invoice_date) }, { key: "supplier", header: "Supplier", priority: 1, cell: (row) => text(row.supplier_name) }, { key: "branch", header: "Branch", priority: 2, cell: (row) => text(row.branch_name) }, { key: "total", header: "Total", align: "right", num: true, priority: 1, cell: (row) => formatKsh(money(row.total)) }, { key: "status", header: "Status", priority: 3, cell: (row) => <StatusBadge tone={text(row.status) === "posted" ? "ok" : "neutral"}>{text(row.status)}</StatusBadge> }]} empty={<EmptyState icon={ReceiptIcon} title="No purchase invoices" description="No supplier purchases match this branch and date range." />} /></Card></>;
    } else {
      const rows = await products.db.query<Record<string, unknown>>(`select r.id, r.name, r.phone, b.name as branch_name, count(s.id) filter (where s.status = 'posted')::integer as deliveries, coalesce(sum(s.total) filter (where s.status = 'posted'), 0) as delivery_value, coalesce(sum(s.balance_due) filter (where s.status = 'posted'), 0) as outstanding from riders r join stock_locations b on b.id = r.branch_id left join sales s on s.rider_id = r.id and s.sale_date >= $2::date and s.sale_date < ($3::date + interval '1 day') where ($1 = '' or r.branch_id = $1) group by r.id, b.name order by delivery_value desc, r.name`, [branchId, from, to]);
      title = "Delivery performance"; subtitle = "Rider-assigned posted sales for the selected branch and date range.";
      content = <><div className="grid gap-4 sm:grid-cols-3"><KpiCard label="Deliveries" value={String(rows.reduce((sum, row) => sum + Number(row.deliveries ?? 0), 0))} /><KpiCard label="Delivered value" value={formatKsh(rows.reduce((sum, row) => sum + money(row.delivery_value), 0))} /><KpiCard label="Delivery credit due" value={formatKsh(rows.reduce((sum, row) => sum + money(row.outstanding), 0))} /></div><Card title="Rider delivery report" flush><DataTable rows={rows} rowKey={(row) => text(row.id)} columns={[{ key: "rider", header: "Rider", priority: 1, cell: (row) => <span><span className="block font-medium">{text(row.name)}</span><span className="text-xs text-ink-subtle">{text(row.phone)}</span></span> }, { key: "branch", header: "Branch", priority: 2, cell: (row) => text(row.branch_name) }, { key: "deliveries", header: "Deliveries", align: "right", num: true, priority: 2, cell: (row) => Number(row.deliveries ?? 0) }, { key: "value", header: "Delivered value", align: "right", num: true, priority: 1, cell: (row) => formatKsh(money(row.delivery_value)) }, { key: "due", header: "Credit due", align: "right", num: true, priority: 3, cell: (row) => formatKsh(money(row.outstanding)) }]} empty={<EmptyState icon={ReceiptIcon} title="No rider deliveries" description="No rider-assigned posted sales match this date range." />} /></Card></>;
    }
    return <AppShell title="Reports" subtitle="Management reporting across sales, customers, stock, purchases, and deliveries" staff={currentStaff} branch={stationName} activeHref="/reports"><PageHeader title={title} subtitle={subtitle} action={<ButtonLink href="/" variant="secondary">Back to dashboard</ButtonLink>} />{reportNavigation}<Card title="Filters" action={<a href={exportHref} className="text-sm font-medium text-orange-700 hover:underline">Download CSV</a>}>{baseFilters}</Card>{content}</AppShell>;
  }

  return <AppShell title="Reports" subtitle="Filter sales by branch, date, customer, rider, payment, and type" staff={currentStaff} branch={stationName} activeHref="/reports">
    <PageHeader title="Sales report" subtitle={`${from} to ${to}`} action={<ButtonLink href="/" variant="secondary">Back to dashboard</ButtonLink>} />
    {reportNavigation}
    {notice ? <p className="rounded-lg border border-warn bg-warn-bg p-3 text-sm text-warn">{notice}</p> : null}
    <Card title="Filters" subtitle="Reports include posted sales by default; choose All to include voided receipts." action={<a href={exportHref} className="text-sm font-medium text-orange-700 hover:underline">Download CSV</a>}>
      <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="report" value="sales" />
        <label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Search receipt, invoice or payment code</span><input name="q" defaultValue={lookup} placeholder="e.g. RCP-001, INV-0001, M-Pesa code" className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm" /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Customer</span><select name="customer" defaultValue={customerId} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"><option value="">All customers and walk-ins</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Branch</span><select name="branch" defaultValue={branchId} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>)}</select></label>
        <label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">From</span><input type="date" name="from" defaultValue={from} max={to} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm" /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">To</span><input type="date" name="to" defaultValue={to} min={from} max={today} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm" /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Rider</span><select name="rider" defaultValue={riderId} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"><option value="">All riders</option>{riders.filter((rider) => !branchId || rider.branchId === branchId).map((rider) => <option key={rider.id} value={rider.id}>{rider.name}{rider.active ? "" : " · inactive"}</option>)}</select></label>
        <label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Sale type</span><select name="type" defaultValue={saleType} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"><option value="">All sale types</option><option value="counter">Counter</option><option value="delivery">Delivery</option></select></label>
        <label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Payment</span><select name="payment" defaultValue={payment} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"><option value="">All payments</option>{Object.entries(paymentNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Status</span><select name="status" defaultValue={status} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"><option value="posted">Posted only</option><option value="all">All receipts</option><option value="void">Void only</option></select></label>
        <div className="flex items-end gap-2"><button type="submit" className="h-10 rounded-md bg-orange-500 px-4 text-sm font-semibold text-ink hover:bg-orange-400">Apply filters</button><a href="/reports" className="inline-flex h-10 items-center px-2 text-sm font-medium text-orange-700 hover:underline">Reset</a></div>
      </form>
    </Card>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KpiCard label="Sales" value={String(posted.length)} subtext="Posted receipts" /><KpiCard label="Revenue" value={formatKsh(revenue)} subtext="Posted sales total" /><KpiCard label="Collected" value={formatKsh(paid)} subtext="Recorded payments" /><KpiCard label="Outstanding" value={formatKsh(due)} subtext={`${deliveries} delivery sale${deliveries === 1 ? "" : "s"}`} /></div>
    <Card title="Sales report" subtitle={`${sales.length} receipt${sales.length === 1 ? "" : "s"} match these filters`} flush><DataTable rows={sales} columns={columns} rowKey={(sale) => sale.id} rowHref={(sale) => `/sales/${sale.id}`} caption="Filtered sales report" empty={<EmptyState icon={ReceiptIcon} title="No sales match these filters" description="Adjust the date range, customer, branch, rider, payment, or search code and try again." />} /></Card>
  </AppShell>;
}
