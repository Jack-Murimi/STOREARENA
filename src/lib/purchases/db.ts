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
