import type { Database } from "@/lib/stock/products";

export interface PurchaseRow {
  id: string;
  invoiceNo: string;
  supplierName: string;
  branchName: string;
  invoiceDate: string;
  dueDate: string | null;
  status: "draft" | "posted" | "void";
  total: number;
  paid: number;
  due: number;
  paymentStatus: "unpaid" | "part_paid" | "paid" | "overdue" | "void";
}

export interface PurchaseSummary {
  billedThisMonth: number;
  paidThisMonth: number;
  outstanding: number;
  overdue: number;
}

/**
 * Reads for the purchases screens.
 *
 * Money comes back from Postgres as a string, because numeric has no safe
 * JavaScript number. Everything is parsed once here so no page has to remember
 * to do it, and none of them can accidentally do arithmetic on a string.
 */
const num = (value: unknown): number =>
  value === null || value === undefined ? 0 : Number(value);

const dateOnly = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) {
    // A DATE has no time zone, so format from the local parts. toISOString()
    // would shift the day back for anyone east of Greenwich.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
};

export async function listPurchases(
  db: Database,
  options: { query?: string; status?: string; supplierId?: string; branchId?: string; showVoid?: boolean } = {},
): Promise<PurchaseRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const push = (value: unknown) => {
    params.push(value);
    return params.length;
  };

  if (options.query) {
    where.push(`(i.invoice_no ilike $${push(`%${options.query}%`)} or s.name ilike $${push(`%${options.query}%`)})`);
  }
  if (options.supplierId) where.push(`i.supplier_id = $${push(options.supplierId)}`);
  if (options.branchId) where.push(`i.branch_id = $${push(options.branchId)}`);
  if (!options.showVoid) where.push(`i.status <> 'void'`);
  if (options.status && options.status !== "all") {
    // payment_status lives in the view, so it filters outside the WHERE on i.
    where.push(`ips.payment_status = $${push(options.status)}`);
  }

  const sqlText = `
    select i.id, i.invoice_no, i.invoice_date, i.due_date, i.status, i.total,
           s.name as supplier_name, l.name as branch_name,
           ips.amount_paid, ips.amount_due, ips.payment_status
      from purchase_invoices i
      join suppliers s on s.id = i.supplier_id
      join stock_locations l on l.id = i.branch_id
      join invoice_payment_status ips on ips.id = i.id
     ${where.length ? "where " + where.join(" and ") : ""}
     order by i.invoice_date desc, i.invoice_no desc
     limit 200`;

  const rows = await db.query<Record<string, unknown>>(sqlText, params);
  return rows.map((r) => ({
    id: String(r.id),
    invoiceNo: String(r.invoice_no),
    supplierName: String(r.supplier_name),
    branchName: String(r.branch_name),
    invoiceDate: dateOnly(r.invoice_date) ?? "",
    dueDate: dateOnly(r.due_date),
    status: r.status as PurchaseRow["status"],
    total: num(r.total),
    paid: num(r.amount_paid),
    due: num(r.amount_due),
    paymentStatus: r.payment_status as PurchaseRow["paymentStatus"],
  }));
}

export async function purchaseSummary(db: Database): Promise<PurchaseSummary> {
  const rows = await db.query<Record<string, unknown>>(
    `select
       coalesce(sum(i.total) filter (
         where i.status = 'posted' and date_trunc('month', i.invoice_date) = date_trunc('month', current_date)
       ), 0) as billed_month,
       coalesce(sum(p.amount) filter (
         where p.status = 'posted' and date_trunc('month', p.paid_on) = date_trunc('month', current_date)
       ), 0) as paid_month,
       coalesce((select sum(b.balance) from supplier_balances b where b.balance > 0), 0) as outstanding,
       coalesce((select sum(b.overdue_amount) from supplier_balances b), 0) as overdue
     from purchase_invoices i
     full outer join supplier_payments p on p.invoice_id = i.id`,
    [],
  );
  const r: Record<string, unknown> = rows[0] ?? {};
  return {
    billedThisMonth: num(r.billed_month),
    paidThisMonth: num(r.paid_month),
    outstanding: num(r.outstanding),
    overdue: num(r.overdue),
  };
}

export async function listSuppliers(db: Database): Promise<{ id: string; name: string }[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select id, name from suppliers where is_active order by name`,
    [],
  );
  return rows.map((r: Record<string, unknown>) => ({ id: String(r.id), name: String(r.name) }));
}

export interface Supplier {
  id: string;
  name: string;
  kraPin: string | null;
  email: string | null;
  phone: string | null;
  paymentTermsDays: number;
  isActive: boolean;
  invoices: number;
  balance: number;
  totalBilled: number;
  totalPaid: number;
  overdueAmount: number;
  oldestOpenDays: number | null;
}

/**
 * Every supplier with the money side attached. The figures come from the
 * `supplier_balances` view and a count off `purchase_invoices` - the view has
 * no invoice count of its own.
 */
export async function listSupplierDirectory(
  db: Database,
  search?: string,
  showInactive = false,
): Promise<Supplier[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select s.id, s.name, s.kra_pin, s.email, s.phone, s.payment_terms_days,
            s.is_active,
            coalesce(b.total_billed, 0)      as total_billed,
            coalesce(b.total_paid, 0)        as total_paid,
            coalesce(b.balance, 0)           as balance,
            coalesce(b.overdue_amount, 0)    as overdue_amount,
            coalesce(
              (select count(*)::int from purchase_invoices i
                where i.supplier_id = s.id and i.status <> 'void'), 0) as invoice_count,
            (select (current_date - min(i.invoice_date))::int
               from purchase_invoices i
              where i.supplier_id = s.id and i.status <> 'void'
                and i.status <> 'paid') as oldest_open_days
       from suppliers s
  left join supplier_balances b on b.supplier_id = s.id
      where ($1::text is null
             or s.name  ilike '%' || $1::text || '%'
             or s.email ilike '%' || $1::text || '%'
             or s.phone like '%' || $1::text || '%')
        and ($2::boolean or s.is_active)
   order by s.name`,
    [search || null, showInactive],
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    kraPin: r.kra_pin ? String(r.kra_pin) : null,
    email: r.email ? String(r.email) : null,
    phone: r.phone ? String(r.phone) : null,
    paymentTermsDays: Number(r.payment_terms_days ?? 0),
    isActive: Boolean(r.is_active),
    invoices: Number(r.invoice_count ?? 0),
    balance: Number(r.balance ?? 0),
    totalBilled: Number(r.total_billed ?? 0),
    totalPaid: Number(r.total_paid ?? 0),
    overdueAmount: Number(r.overdue_amount ?? 0),
    oldestOpenDays: r.oldest_open_days === null ? null : Number(r.oldest_open_days),
  }));
}

export interface SupplierDetail {
  id: string;
  name: string;
  kraPin: string | null;
  email: string | null;
  phone: string | null;
  paymentTermsDays: number;
  isActive: boolean;
  totalBilled: number;
  totalPaid: number;
  balance: number;
  overdueAmount: number;
  ageing: { current: number; d1_30: number; d31_60: number; d61_90: number; d90Plus: number };
  lastInvoiceDate: string | null;
  lastPaymentDate: string | null;
}

export async function supplierById(db: Database, id: string): Promise<SupplierDetail | null> {
  const rows = await db.query<Record<string, unknown>>(
    `select s.id, s.name, s.kra_pin, s.email, s.phone, s.payment_terms_days, s.is_active,
            coalesce(b.total_billed,0)   as total_billed,
            coalesce(b.total_paid,0)     as total_paid,
            coalesce(b.balance,0)        as balance,
            coalesce(b.overdue_amount,0) as overdue_amount,
            coalesce(b.ageing_current,0) as ageing_current,
            coalesce(b.ageing_1_30,0)    as ageing_1_30,
            coalesce(b.ageing_31_60,0)   as ageing_31_60,
            coalesce(b.ageing_61_90,0)   as ageing_61_90,
            coalesce(b.ageing_90_plus,0) as ageing_90_plus,
            b.last_invoice_date, b.last_payment_date
       from suppliers s
  left join supplier_balances b on b.supplier_id = s.id
      where s.id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r.id), name: String(r.name),
    kraPin: r.kra_pin ? String(r.kra_pin) : null,
    email: r.email ? String(r.email) : null,
    phone: r.phone ? String(r.phone) : null,
    paymentTermsDays: Number(r.payment_terms_days ?? 0),
    isActive: Boolean(r.is_active),
    totalBilled: Number(r.total_billed ?? 0),
    totalPaid: Number(r.total_paid ?? 0),
    balance: Number(r.balance ?? 0),
    overdueAmount: Number(r.overdue_amount ?? 0),
    ageing: {
      current: Number(r.ageing_current ?? 0), d1_30: Number(r.ageing_1_30 ?? 0),
      d31_60: Number(r.ageing_31_60 ?? 0), d61_90: Number(r.ageing_61_90 ?? 0),
      d90Plus: Number(r.ageing_90_plus ?? 0),
    },
    lastInvoiceDate: r.last_invoice_date ? dateOnly(r.last_invoice_date) : null,
    lastPaymentDate: r.last_payment_date ? dateOnly(r.last_payment_date) : null,
  };
}

export interface StatementLine {
  date: string; reference: string; kind: "invoice" | "payment";
  debit: number; credit: number; running: number; status: string;
}

/**
 * The account as the supplier sees it: every invoice debits, every payment
 * credits, and the running column is what we owe at that point. The running
 * balance is a window over the whole set, so it is computed in the database
 * rather than accumulated in a loop here.
 */
export async function supplierStatement(db: Database, id: string): Promise<StatementLine[]> {
  const rows = await db.query<Record<string, unknown>>(
    `with entries as (
       select i.invoice_date as entry_date, i.invoice_no as ref, 'invoice' as kind,
              i.total as debit, 0::numeric(14,2) as credit, i.status
         from public.purchase_invoices i
        where i.supplier_id = $1 and i.status <> 'void'
       union all
       select p.paid_on, coalesce(nullif(p.reference,''), p.id::text), 'payment',
              0::numeric(14,2), p.amount, p.status
         from public.supplier_payments p
        where p.supplier_id = $1 and p.status <> 'void'
     )
     select entry_date, ref, kind, debit, credit, status,
            sum(debit - credit) over (order by entry_date, ref
                                      rows between unbounded preceding and current row) as running
       from entries
      order by entry_date, ref`,
    [id],
  );
  return rows.map((r) => ({
    // invoice_date and paid_on are NOT NULL, but dateOnly() cannot know that.
    date: dateOnly(r.entry_date) ?? "",
    reference: String(r.ref),
    kind: r.kind === "payment" ? "payment" : "invoice",
    debit: Number(r.debit ?? 0),
    credit: Number(r.credit ?? 0),
    running: Number(r.running ?? 0),
    status: String(r.status),
  }));
}

export interface PurchaseDetail {
  id: string; supplierId: string; supplierName: string; branchName: string;
  invoiceNo: string; invoiceDate: string; dueDate: string;
  status: string; subtotal: number; vatAmount: number; total: number;
  paid: number; due: number; paymentStatus: string;
  notes: string | null; voidReason: string | null; version: number; createdAt: string;
}

export async function purchaseById(db: Database, id: string): Promise<PurchaseDetail | null> {
  const rows = await db.query<Record<string, unknown>>(
    `select i.id, i.supplier_id, s.name as supplier_name, l.name as branch_name,
            i.invoice_no, i.invoice_date, i.due_date, i.status,
            i.subtotal, i.vat_amount, i.total, i.notes, i.void_reason,
            i.version, i.created_at,
            coalesce(p.amount_paid,0) as amount_paid,
            coalesce(p.amount_due,0)  as amount_due,
            coalesce(p.payment_status, i.status) as payment_status
       from purchase_invoices i
       join suppliers s          on s.id = i.supplier_id
       join stock_locations l    on l.id = i.branch_id
  left join invoice_payment_status p on p.id = i.id
      where i.id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r.id), supplierId: String(r.supplier_id),
    supplierName: String(r.supplier_name), branchName: String(r.branch_name),
    invoiceNo: String(r.invoice_no),
    invoiceDate: dateOnly(r.invoice_date) ?? "", dueDate: dateOnly(r.due_date) ?? "",
    status: String(r.status),
    subtotal: Number(r.subtotal), vatAmount: Number(r.vat_amount), total: Number(r.total),
    paid: Number(r.amount_paid), due: Number(r.amount_due),
    paymentStatus: String(r.payment_status),
    notes: r.notes ? String(r.notes) : null,
    voidReason: r.void_reason ? String(r.void_reason) : null,
    version: Number(r.version ?? 1),
    createdAt: String(r.created_at).slice(0, 16).replace("T", " "),
  };
}

export interface PurchaseLine {
  id: number; productName: string; categoryName: string; purchaseType: string;
  quantity: number; unitCost: number; lineTotal: number;
}

/** Lines with the product name attached. purchase_type is returned verbatim -
 *  the page owns turning it into words, because "refill" and "new_cylinder"
 *  must never be shown as the same thing. */
export async function purchaseLines(db: Database, id: string): Promise<PurchaseLine[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select ln.id, v.name as product_name, c.name as category_name,
            ln.purchase_type, ln.quantity, ln.unit_cost, ln.line_total
       from purchase_invoice_lines ln
       join product_variants v on v.id = ln.product_id
       join categories c       on c.id = v.category_id
      where ln.invoice_id = $1
      order by ln.id`,
    [id],
  );
  return rows.map((r) => ({
    id: Number(r.id), productName: String(r.product_name), categoryName: String(r.category_name),
    purchaseType: String(r.purchase_type),
    quantity: Number(r.quantity), unitCost: Number(r.unit_cost), lineTotal: Number(r.line_total),
  }));
}

export interface PurchasePayment {
  id: string; paidOn: string; amount: number; method: string;
  reference: string | null; status: string; voidReason: string | null;
}

export async function purchasePayments(db: Database, id: string): Promise<PurchasePayment[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select id, paid_on, amount, method, reference, status, void_reason
       from supplier_payments where invoice_id = $1 order by paid_on, id`,
    [id],
  );
  return rows.map((r) => ({
    id: String(r.id), paidOn: dateOnly(r.paid_on) ?? "", amount: Number(r.amount),
    method: String(r.method), reference: r.reference ? String(r.reference) : null,
    status: String(r.status), voidReason: r.void_reason ? String(r.void_reason) : null,
  }));
}

export interface HistoryEntry {
  id: string; occurredAt: string; actor: string; role: string | null;
  action: string; reason: string | null; changedFields: string[];
}

export async function purchaseHistory(db: Database, id: string): Promise<HistoryEntry[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select id, occurred_at, actor_email, actor_role, action, reason, changed_fields
       from audit_log
      where record_id = $1::text
      order by occurred_at desc, id desc`,
    [id],
  );
  return rows.map((r) => ({
    id: String(r.id),
    occurredAt: String(r.occurred_at).slice(0, 16).replace("T", " "),
    actor: r.actor_email ? String(r.actor_email) : "system",
    role: r.actor_role ? String(r.actor_role) : null,
    action: String(r.action),
    reason: r.reason ? String(r.reason) : null,
    changedFields: Array.isArray(r.changed_fields) ? r.changed_fields.map(String) : [],
  }));
}
