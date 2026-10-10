import { getCustomerContext } from "@/lib/db";

export const dynamic = "force-dynamic";

const csv = (value: unknown): string => `"${String(value ?? "").replaceAll('"', '""')}"`;
const reportIds = new Set(["sales", "customers", "inventory", "purchases", "deliveries"]);

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const report = reportIds.has(url.searchParams.get("report") ?? "") ? url.searchParams.get("report")! : "sales";
  const branch = url.searchParams.get("branch") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const { products } = await getCustomerContext();
  if (!products) return new Response("Reports database is unavailable.", { status: 503 });

  let heading: string[];
  let rows: Record<string, unknown>[];
  if (report === "customers") {
    heading = ["Customer", "Code", "Invoiced", "Paid", "Balance"];
    rows = await products.db.query<Record<string, unknown>>("select c.name, c.code, coalesce(v.invoiced,0) invoiced, coalesce(v.paid,0) paid, coalesce(v.balance,0) balance from customers c left join v_customer_balance v on v.id = c.id order by balance desc, c.name");
  } else if (report === "inventory") {
    heading = ["Branch", "Product", "Brand", "Size kg", "Refills", "Empties"];
    rows = await products.db.query<Record<string, unknown>>(`select l.name branch, pv.name product, b.name brand, pv.size_kg, coalesce(sum(p.quantity) filter (where p.state='REFILL'),0) refills, coalesce(sum(p.quantity) filter (where p.state='EMPTY'),0) empties from inventory_positions p join stock_locations l on l.id=p.location_id join product_variants pv on pv.id=p.variant_id join brands b on b.id=pv.brand_id where ($1='' or p.location_id=$1) group by l.name,pv.id,b.name order by l.name,pv.name`, [branch]);
  } else if (report === "purchases") {
    heading = ["Invoice", "Date", "Supplier", "Branch", "Status", "Total"];
    rows = await products.db.query<Record<string, unknown>>(`select p.invoice_no invoice, p.invoice_date date, s.name supplier, b.name branch, p.status, p.total from purchase_invoices p join suppliers s on s.id=p.supplier_id join stock_locations b on b.id=p.branch_id where ($1='' or p.branch_id=$1) and p.invoice_date >= $2::date and p.invoice_date <= $3::date order by p.invoice_date desc`, [branch, from, to]);
  } else if (report === "deliveries") {
    heading = ["Rider", "Phone", "Branch", "Deliveries", "Delivered value", "Credit due"];
    rows = await products.db.query<Record<string, unknown>>(`select r.name rider, r.phone, b.name branch, count(s.id) filter(where s.status='posted') deliveries, coalesce(sum(s.total) filter(where s.status='posted'),0) delivered_value, coalesce(sum(s.balance_due) filter(where s.status='posted'),0) credit_due from riders r join stock_locations b on b.id=r.branch_id left join sales s on s.rider_id=r.id and s.sale_date >= $2::date and s.sale_date < ($3::date + interval '1 day') where ($1='' or r.branch_id=$1) group by r.id,b.name order by delivered_value desc`, [branch, from, to]);
  } else {
    heading = ["Receipt", "Date", "Branch", "Customer", "Rider", "Type", "Total", "Paid", "Balance due", "Status"];
    rows = await products.db.query<Record<string, unknown>>(`select s.receipt_no receipt, s.sale_date date, b.name branch, coalesce(c.name,'Walk-in') customer, coalesce(r.name,'') rider, s.sale_type type, s.total, s.amount_paid paid, s.balance_due, s.status from sales s join stock_locations b on b.id=s.branch_id left join customers c on c.id=s.customer_id left join riders r on r.id=s.rider_id where ($1='' or s.branch_id=$1) and s.sale_date >= $2::date and s.sale_date < ($3::date + interval '1 day') order by s.sale_date desc`, [branch, from, to]);
  }
  const fields = Object.keys(rows[0] ?? {});
  const document = [heading.map(csv).join(","), ...rows.map((row) => fields.map((field) => csv(row[field])).join(","))].join("\r\n");
  return new Response(document, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="gateway-gas-${report}-report.csv"` } });
}
