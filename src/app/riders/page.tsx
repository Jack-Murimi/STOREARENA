import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { Banner } from "@/components/customers/Form";
import { SavedToast } from "@/components/customers/SavedToast";
import { TruckIcon } from "@/components/icons";
import { Button, ButtonLink, Card, DataTable, EmptyState, FilterBar, KpiCard, PageHeader, SearchInput, StatusBadge } from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { formatKsh } from "@/lib/format";
import { createRider, deactivateRider } from "./actions";

export const metadata: Metadata = { title: "Riders" };
export const dynamic = "force-dynamic";

type RiderRow = {
  id: string;
  name: string;
  phone: string;
  branchName: string;
  branchCode: string;
  active: boolean;
  deliveries: number;
  deliveryValue: number;
  lastDelivery: string | null;
};

type Branch = { id: string; name: string; code: string };
const asText = (value: unknown): string => value === null || value === undefined ? "" : String(value);

function deliveryDate(value: string | null): string {
  if (!value) return "No deliveries yet";
  return new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" }).format(new Date(value));
}

export default async function RidersPage({ searchParams }: { searchParams: Promise<{ q?: string; new?: string; error?: string; saved?: string }> }) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const showNewForm = params.new === "1";
  const { products, notice, diagnostic } = await getCustomerContext();

  if (!products) {
    return <AppShell title="Riders" subtitle="Delivery team" staff={currentStaff} branch={stationName} activeHref="/riders"><DatabaseUnavailable notice={notice} diagnostic={diagnostic} /></AppShell>;
  }

  const [riderRows, branchRows] = await Promise.all([
    products.db.query<Record<string, unknown>>(
      `select r.id, r.name, r.phone, r.is_active,
              b.name as branch_name, b.code as branch_code,
              count(s.id) filter (where s.status = 'posted')::integer as deliveries,
              coalesce(sum(s.total) filter (where s.status = 'posted'), 0) as delivery_value,
              max(s.sale_date) filter (where s.status = 'posted') as last_delivery
         from riders r
         join stock_locations b on b.id = r.branch_id
    left join sales s on s.rider_id = r.id
        where ($1 = '' or r.name ilike '%' || $1 || '%' or r.phone ilike '%' || $1 || '%' or b.name ilike '%' || $1 || '%')
        group by r.id, b.name, b.code
        order by r.is_active desc, r.name`,
      [query],
    ),
    products.db.query<Record<string, unknown>>(
      "select id, name, code from stock_locations where kind = 'BRANCH' and active order by name",
    ),
  ]);

  const riders: RiderRow[] = riderRows.map((row) => ({
    id: asText(row.id), name: asText(row.name), phone: asText(row.phone),
    branchName: asText(row.branch_name), branchCode: asText(row.branch_code),
    active: row.is_active === true || row.is_active === "t", deliveries: Number(row.deliveries ?? 0),
    deliveryValue: Number(row.delivery_value ?? 0), lastDelivery: row.last_delivery ? asText(row.last_delivery) : null,
  }));
  const branches: Branch[] = branchRows.map((row) => ({ id: asText(row.id), name: asText(row.name), code: asText(row.code) }));
  const active = riders.filter((rider) => rider.active);
  const deliveryCount = riders.reduce((sum, rider) => sum + rider.deliveries, 0);

  const columns: DataColumn<RiderRow>[] = [
    { key: "rider", header: "Rider", priority: 1, cell: (rider) => <span className="block"><span className="font-medium text-ink">{rider.name}</span><a className="relative z-20 block w-fit text-sm text-orange-700 hover:underline" href={`tel:${rider.phone}`}>{rider.phone}</a></span> },
    { key: "branch", header: "Branch", priority: 2, cell: (rider) => <span>{rider.branchName}<span className="code ml-1 text-xs text-ink-subtle">{rider.branchCode}</span></span> },
    { key: "deliveries", header: "Deliveries", align: "right", num: true, priority: 2, cell: (rider) => rider.deliveries },
    { key: "value", header: "Delivered value", align: "right", num: true, priority: 3, cell: (rider) => formatKsh(rider.deliveryValue) },
    { key: "last", header: "Last delivery", priority: 3, cell: (rider) => <span className="text-ink-subtle">{deliveryDate(rider.lastDelivery)}</span> },
    { key: "status", header: "Status", priority: 3, cell: (rider) => rider.active ? <StatusBadge tone="ok">Active</StatusBadge> : <StatusBadge tone="neutral">Inactive</StatusBadge> },
    { key: "action", header: "", align: "right", cell: (rider) => rider.active ? <form action={deactivateRider}><input type="hidden" name="id" value={rider.id} /><Button type="submit" variant="danger" size="sm">Deactivate</Button></form> : <span className="text-xs text-ink-subtle">Not assignable</span> },
  ];

  return <>
    <SavedToast key={params.saved ?? "none"} message={params.saved ?? null} />
    <AppShell title="Riders" subtitle="Delivery team and delivery history" staff={currentStaff} branch={stationName} activeHref="/riders">
      <PageHeader title="Riders" subtitle="Create delivery riders, see their branch and delivery activity" action={<ButtonLink href={showNewForm ? "/riders" : "/riders?new=1"} variant="primary">{showNewForm ? "Close" : "New rider"}</ButtonLink>} />
      {notice ? <Banner tone="warn">{notice}</Banner> : null}
      {params.error ? <Banner tone="bad">{params.error}</Banner> : null}
      {showNewForm ? <Card title="New rider" subtitle="Riders are assigned to one branch; they do not hold stock."><form action={createRider} className="grid gap-3 sm:grid-cols-3"><label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Full name</span><input className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm" name="name" required minLength={2} autoComplete="name" /></label><label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Phone</span><input className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm" name="phone" required minLength={7} inputMode="tel" autoComplete="tel" /></label><label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Branch</span><select className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm" name="branch_id" required defaultValue=""><option value="" disabled>Choose branch…</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>)}</select></label><div className="sm:col-span-3"><Button type="submit" variant="primary">Create rider</Button></div></form></Card> : null}
      <div className="grid gap-4 sm:grid-cols-3"><KpiCard label="Active riders" value={String(active.length)} subtext={`${riders.length - active.length} inactive`} /><KpiCard label="Recorded deliveries" value={String(deliveryCount)} subtext="Posted rider-assigned sales" /><KpiCard label="Delivered value" value={formatKsh(riders.reduce((sum, rider) => sum + rider.deliveryValue, 0))} subtext="Posted rider-assigned sales" /></div>
      <FilterBar search={<form action="/riders" method="get" role="search"><SearchInput name="q" defaultValue={query} placeholder="Name, phone or branch" label="Search riders" /></form>} filters={<p className="text-sm text-ink-subtle">{riders.length} riders shown</p>} />
      <Card flush><DataTable rows={riders} columns={columns} rowKey={(rider) => rider.id} caption="Riders and their delivery activity" empty={<EmptyState icon={TruckIcon} title={query ? `No rider matches “${query}”` : "No riders yet"} description={query ? "Try a rider name, phone number, or branch." : "Create the first rider before assigning deliveries."} action={<ButtonLink href="/riders?new=1" variant="primary">New rider</ButtonLink>} />} /></Card>
    </AppShell>
  </>;
}
