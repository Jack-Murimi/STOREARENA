import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { Card, DataTable, KpiCard, PageHeader, StatusBadge } from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { currentStaffAccess } from "@/lib/auth";
import { getCustomerContext } from "@/lib/db";

export const metadata: Metadata = { title: "My deliveries" };
export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const text = (v: unknown) => v == null ? "" : String(v);
const date = (v: unknown) => new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(new Date(text(v)));
const ranges = { day: 1, week: 7, month: 30 } as const;

export default async function RiderHome({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: raw } = await searchParams; const period = raw === "week" || raw === "month" ? raw : "day";
  const staff = await currentStaffAccess(); const { products } = await getCustomerContext();
  if (!staff || staff.role !== "rider") redirect("/");
  if (!products) return <main className="grid min-h-screen place-items-center p-4">Database unavailable.</main>;
  const rider = await products.db.query<Row>("select id,name from riders where user_id=$1 and is_active", [staff.id]);
  if (!rider[0]) return <main className="grid min-h-screen place-items-center p-4">Your account is not linked to an active rider profile.</main>;
  const riderId = text(rider[0].id); const days = ranges[period];
  const [mine, peers, unpaid, prices] = await Promise.all([
    products.db.query<Row>(`select s.id,s.receipt_no,s.sale_date,c.name customer_name,s.balance_due > 0 unpaid from sales s left join customers c on c.id=s.customer_id where s.rider_id=$1 and s.status='posted' and s.sale_date >= (current_date - ($2 - 1) * interval '1 day') at time zone 'Africa/Nairobi' order by s.sale_date desc limit 100`, [riderId, days]),
    products.db.query<Row>(`select r.id,r.name,count(s.id)::int deliveries from riders r left join sales s on s.rider_id=r.id and s.status='posted' and s.sale_date >= (current_date - ($1 - 1) * interval '1 day') at time zone 'Africa/Nairobi' where r.is_active group by r.id,r.name order by deliveries desc,r.name`, [days]),
    products.db.query<Row>("select s.id,s.receipt_no,s.sale_date,c.name customer_name,true unpaid from sales s left join customers c on c.id=s.customer_id where s.rider_id=$1 and s.status='posted' and s.balance_due > 0 order by s.sale_date desc", [riderId]),
    products.db.query<Row>("select v.id,v.name,b.name brand_name,v.size_kg,v.list_price_ksh from product_variants v join brands b on b.id=v.brand_id order by b.name,v.size_kg nulls last,v.name"),
  ]);
  const myCount = mine.length; const peerAverage = peers.length ? peers.reduce((sum, row) => sum + Number(row.deliveries), 0) / peers.length : 0;
  const deliveryColumns: DataColumn<Row>[] = [{ key: "receipt", header: "Receipt", priority: 1, cell: (r) => <span className="code font-semibold">{text(r.receipt_no)}</span> }, { key: "customer", header: "Customer", priority: 1, cell: (r) => text(r.customer_name) || "Walk-in" }, { key: "date", header: "Date", priority: 2, cell: (r) => date(r.sale_date) }, { key: "paid", header: "Payment", priority: 2, cell: (r) => r.unpaid ? <StatusBadge tone="warn">Unpaid</StatusBadge> : <StatusBadge tone="ok">Paid</StatusBadge> }];
  const peerColumns: DataColumn<Row>[] = [{ key: "rider", header: "Rider", priority: 1, cell: (r) => <span className={text(r.id) === riderId ? "font-semibold" : ""}>{text(r.name)}{text(r.id) === riderId ? " (you)" : ""}</span> }, { key: "deliveries", header: "Deliveries", num: true, align: "right", priority: 1, cell: (r) => Number(r.deliveries) }];
  const priceColumns: DataColumn<Row>[] = [{ key: "product", header: "Product", priority: 1, cell: (r) => <span className="font-medium">{text(r.brand_name)} {text(r.name)}</span> }, { key: "size", header: "Size", priority: 2, cell: (r) => r.size_kg ? `${text(r.size_kg)} kg` : "—" }, { key: "price", header: "Price", align: "right", num: true, priority: 1, cell: (r) => r.list_price_ksh == null ? "—" : `KSh ${Number(r.list_price_ksh).toLocaleString("en-KE")}` }];
  return <div className="min-h-screen bg-bg"><Topbar title="My deliveries" subtitle="Your delivery activity" staff={{ name: staff.fullName, initials: staff.fullName.split(/\s+/).map((p) => p[0]).join("").slice(0, 2), role: "Rider" }} /><main className="page-shell space-y-4 pb-8"><PageHeader title={`Hello, ${text(rider[0].name).split(" ")[0]}`} subtitle="Deliveries and product prices" /><nav className="flex gap-2"><a className={period === "day" ? "rounded bg-orange-500 px-3 py-2 text-sm font-semibold" : "rounded border px-3 py-2 text-sm"} href="/rider?period=day">Today</a><a className={period === "week" ? "rounded bg-orange-500 px-3 py-2 text-sm font-semibold" : "rounded border px-3 py-2 text-sm"} href="/rider?period=week">Week</a><a className={period === "month" ? "rounded bg-orange-500 px-3 py-2 text-sm font-semibold" : "rounded border px-3 py-2 text-sm"} href="/rider?period=month">Month</a></nav><div className="grid gap-4 sm:grid-cols-3"><KpiCard label="My deliveries" value={String(myCount)} subtext={`${period} to date`} /><KpiCard label="Team average" value={peerAverage.toFixed(1)} subtext="Deliveries per active rider" /><KpiCard label="Unpaid receipts" value={String(unpaid.length)} subtext="Open a receipt to view its total" /></div><Card title="My deliveries" subtitle="Open a receipt to view its details"><DataTable rows={mine} columns={deliveryColumns} rowKey={(r) => text(r.id)} rowHref={(r) => `/rider/receipts/${text(r.id)}`} rowLabel={(r) => text(r.receipt_no)} /></Card><Card title="Unpaid deliveries" subtitle="Receipt totals are shown only after opening a receipt"><DataTable rows={unpaid} columns={deliveryColumns} rowKey={(r) => text(r.id)} rowHref={(r) => `/rider/receipts/${text(r.id)}`} rowLabel={(r) => text(r.receipt_no)} /></Card><Card title="Team delivery count" subtitle="Counts only; no delivery values"><DataTable rows={peers} columns={peerColumns} rowKey={(r) => text(r.id)} /></Card><Card title="Product prices"><DataTable rows={prices} columns={priceColumns} rowKey={(r) => text(r.id)} /></Card></main></div>;
}
