import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { Card, DataTable, PageHeader, StatusBadge } from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { currentStaffAccess } from "@/lib/auth";
import { getCustomerContext } from "@/lib/db";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const text = (v: unknown) => v == null ? "" : String(v);

export default async function RiderReceipt({ params }: { params: Promise<{ id: string }> }) {
  const staff = await currentStaffAccess(); const { products } = await getCustomerContext(); const { id } = await params;
  if (!staff || staff.role !== "rider") redirect("/");
  if (!products) return <main className="grid min-h-screen place-items-center p-4">Database unavailable.</main>;
  const [sale] = await products.db.query<Row>(`select s.receipt_no,s.sale_date,s.total,s.amount_paid,s.balance_due,c.name customer_name from sales s join riders r on r.id=s.rider_id left join customers c on c.id=s.customer_id where s.id=$1 and r.user_id=$2 and s.status='posted'`, [id, staff.id]);
  if (!sale) notFound();
  const lines = await products.db.query<Row>("select l.id,v.name,b.name brand_name,l.quantity,l.unit_price,l.line_total from sale_lines l join product_variants v on v.id=l.variant_id join brands b on b.id=v.brand_id where l.sale_id=$1 order by l.id", [id]);
  const money = (v: unknown) => `KSh ${Number(v).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
  const columns: DataColumn<Row>[] = [{ key: "product", header: "Product", priority: 1, cell: (r) => `${text(r.brand_name)} ${text(r.name)}` }, { key: "qty", header: "Qty", num: true, align: "right", priority: 1, cell: (r) => Number(r.quantity) }, { key: "price", header: "Unit price", num: true, align: "right", priority: 2, cell: (r) => money(r.unit_price) }, { key: "total", header: "Total", num: true, align: "right", priority: 1, cell: (r) => money(r.line_total) }];
  const initials = staff.fullName.split(/\s+/).map((p) => p[0]).join("").slice(0, 2);
  return <div className="min-h-screen bg-bg"><Topbar title={`Receipt ${text(sale.receipt_no)}`} staff={{ name: staff.fullName, initials, role: "Rider" }} /><main className="page-shell space-y-4 pb-8"><PageHeader title={`Receipt ${text(sale.receipt_no)}`} subtitle={new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(new Date(text(sale.sale_date)))} menu={<a className="text-sm font-semibold text-orange-700" href="/rider">Back to deliveries</a>} /><Card title={text(sale.customer_name) || "Walk-in customer"}><DataTable rows={lines} columns={columns} rowKey={(r) => text(r.id)} /></Card><Card title="Receipt total"><dl className="space-y-2 text-sm"><div className="flex justify-between"><dt>Total</dt><dd className="font-semibold">{money(sale.total)}</dd></div><div className="flex justify-between"><dt>Paid</dt><dd>{money(sale.amount_paid)}</dd></div><div className="flex justify-between"><dt>Balance</dt><dd><StatusBadge tone={Number(sale.balance_due) > 0 ? "warn" : "ok"}>{money(sale.balance_due)}</StatusBadge></dd></div></dl></Card></main></div>;
}
