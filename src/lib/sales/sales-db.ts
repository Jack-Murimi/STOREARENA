import type { Database } from "@/lib/stock/products";

export interface SaleListRow {
  id: string;
  receiptNo: string;
  saleDate: string;
  saleType: "counter" | "delivery";
  status: "posted" | "void";
  customerName: string | null;
  riderName: string | null;
  lineCount: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  paymentMethods: string[];
}

export interface SaleDetail extends Omit<SaleListRow, "lineCount" | "paymentMethods"> {
  branchName: string;
  customerLocation: string | null;
  attendantName: string | null;
  creditDueDate: string | null;
  voidReason: string | null;
  notes: string | null;
  lines: SaleDetailLine[];
  payments: SalePaymentRow[];
}

export interface SaleDetailLine {
  id: string;
  name: string;
  brandName: string;
  lineType: string;
  quantity: number;
  listPrice: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
  emptiesReturned: number;
  emptyBrandName: string | null;
  emptyReturns: { brandName: string; quantity: number }[];
}

export interface SalePaymentRow {
  id: string;
  method: string;
  amount: number;
  reference: string | null;
}

const value = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const nullable = (v: unknown): string | null => {
  const text = value(v).trim();
  return text === "" ? null : text;
};
const money = (v: unknown): number => Number(v ?? 0);

/** Branch sales history without cost_at_sale. Cost never crosses this boundary. */
export async function listSales(
  db: Database,
  branchId: string,
  search = "",
): Promise<SaleListRow[]> {
  const term = search.trim();
  const rows = await db.query<Record<string, unknown>>(
    `select s.id, s.receipt_no, s.sale_date, s.sale_type, s.status,
            c.name as customer_name, r.name as rider_name,
            count(distinct l.id)::integer as line_count,
            s.total, s.amount_paid, s.balance_due,
            coalesce(array_agg(distinct p.method) filter (where p.method is not null), '{}') as payment_methods
       from sales s
  left join customers c on c.id = s.customer_id
  left join riders r on r.id = s.rider_id
  left join sale_lines l on l.sale_id = s.id
  left join sale_payments p on p.sale_id = s.id
      where s.branch_id = $1
        and ($2 = '' or s.receipt_no ilike '%' || $2 || '%'
          or c.name ilike '%' || $2 || '%'
          or r.name ilike '%' || $2 || '%')
      group by s.id, c.name, r.name
      order by s.sale_date desc
      limit 100`,
    [branchId, term],
  );
  return rows.map((row) => ({
    id: value(row.id),
    receiptNo: value(row.receipt_no),
    saleDate: value(row.sale_date),
    saleType: value(row.sale_type) === "delivery" ? "delivery" : "counter",
    status: value(row.status) === "void" ? "void" : "posted",
    customerName: nullable(row.customer_name),
    riderName: nullable(row.rider_name),
    lineCount: Number(row.line_count ?? 0),
    total: money(row.total),
    amountPaid: money(row.amount_paid),
    balanceDue: money(row.balance_due),
    paymentMethods: Array.isArray(row.payment_methods)
      ? row.payment_methods.map((method) => value(method))
      : [],
  }));
}

/** A receipt-detail view. It deliberately does not select cost_at_sale. */
export async function getSaleDetail(db: Database, saleId: string): Promise<SaleDetail | null> {
  const [headerRows, lineRows, paymentRows, emptyReturnRows] = await Promise.all([
    db.query<Record<string, unknown>>(
      `select s.id, s.receipt_no, s.sale_date, s.sale_type, s.status, s.total,
              s.amount_paid, s.balance_due, s.credit_due_date, s.void_reason, s.notes,
              c.name as customer_name, cl.label as customer_location,
              r.name as rider_name, u.full_name as attendant_name, b.name as branch_name
         from sales s
    left join customers c on c.id = s.customer_id
    left join customer_locations cl on cl.id = s.customer_location_id
    left join riders r on r.id = s.rider_id
    left join app_users u on u.id = s.user_id
         join stock_locations b on b.id = s.branch_id
        where s.id = $1`,
      [saleId],
    ),
    db.query<Record<string, unknown>>(
      `select l.id, pv.name, b.name as brand_name, l.line_type, l.quantity,
              l.list_price, l.unit_price, l.discount_amount, l.line_total,
              l.empties_returned, eb.name as empty_brand_name
         from sale_lines l
         join product_variants pv on pv.id = l.variant_id
         join brands b on b.id = pv.brand_id
    left join brands eb on eb.id = l.empty_brand_id
        where l.sale_id = $1
        order by l.id`,
      [saleId],
    ),
    db.query<Record<string, unknown>>(
      "select id, method, amount, reference from sale_payments where sale_id = $1 order by created_at, id",
      [saleId],
    ),
    db.query<Record<string, unknown>>(
      `select er.sale_line_id, er.quantity, b.name as brand_name
         from sale_line_returns er
         join sale_lines l on l.id = er.sale_line_id
         join product_variants pv on pv.id = er.returned_variant_id
         join brands b on b.id = pv.brand_id
        where l.sale_id = $1
        order by er.sale_line_id, b.name`,
      [saleId],
    ),
  ]);
  const header = headerRows[0];
  if (!header) return null;

  return {
    id: value(header.id),
    receiptNo: value(header.receipt_no),
    saleDate: value(header.sale_date),
    saleType: value(header.sale_type) === "delivery" ? "delivery" : "counter",
    status: value(header.status) === "void" ? "void" : "posted",
    customerName: nullable(header.customer_name),
    customerLocation: nullable(header.customer_location),
    riderName: nullable(header.rider_name),
    attendantName: nullable(header.attendant_name),
    branchName: value(header.branch_name),
    creditDueDate: nullable(header.credit_due_date),
    voidReason: nullable(header.void_reason),
    notes: nullable(header.notes),
    total: money(header.total),
    amountPaid: money(header.amount_paid),
    balanceDue: money(header.balance_due),
    lines: lineRows.map((line) => ({
      id: value(line.id),
      name: value(line.name),
      brandName: value(line.brand_name),
      lineType: value(line.line_type),
      quantity: Number(line.quantity ?? 0),
      listPrice: money(line.list_price),
      unitPrice: money(line.unit_price),
      discountAmount: money(line.discount_amount),
      // line_total is generated as qty × unit_price in the legacy schema;
      // discount is stored separately, so receipts render the net amount.
      lineTotal: money(line.line_total) - money(line.discount_amount),
      emptiesReturned: Number(line.empties_returned ?? 0),
      emptyBrandName: nullable(line.empty_brand_name),
      emptyReturns: emptyReturnRows
        .filter((returned) => value(returned.sale_line_id) === value(line.id))
        .map((returned) => ({ brandName: value(returned.brand_name), quantity: Number(returned.quantity ?? 0) })),
    })),
    payments: paymentRows.map((payment) => ({
      id: value(payment.id),
      method: value(payment.method),
      amount: money(payment.amount),
      reference: nullable(payment.reference),
    })),
  };
}
