import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { Banner } from "@/components/customers/Form";
import { SavedToast } from "@/components/customers/SavedToast";
import { TruckIcon } from "@/components/icons";
import {
  Button,
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  FilterBar,
  KpiCard,
  PageHeader,
  SearchInput,
  StatusBadge,
} from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { formatKsh } from "@/lib/format";
import { createRider, setRiderActive } from "./actions";

export const metadata: Metadata = { title: "Riders" };
export const dynamic = "force-dynamic";

type RiderRow = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  deliveries: number;
  deliveryValue: number;
  lastDelivery: string | null;
};

const asText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

function deliveryDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Nairobi",
  }).format(new Date(value));
}

function dateInput(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(date);
}

function safeDate(value: string | undefined, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export default async function RidersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; new?: string; error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const today = dateInput(now);
  const thirtyDaysAgo = dateInput(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
  const from = safeDate(params.from, thirtyDaysAgo);
  const to = safeDate(params.to, today);
  const query = params.q?.trim() ?? "";
  const showNewForm = params.new === "1";

  const { products, notice, diagnostic } = await getCustomerContext();

  if (!products) {
    return (
      <AppShell title="Riders" subtitle="Delivery team" staff={currentStaff} branch={stationName} activeHref="/riders">
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
    );
  }

  const riderRows = await products.db.query<Record<string, unknown>>(
      `select r.id, r.name, r.phone, r.is_active,
              count(s.id) filter (where s.status = 'posted')::integer as deliveries,
              coalesce(sum(s.total) filter (where s.status = 'posted'), 0) as delivery_value,
              max(s.sale_date) filter (where s.status = 'posted') as last_delivery
         from riders r
    left join sales s on s.rider_id = r.id
                    and s.sale_date >= $1::date
                    and s.sale_date < ($2::date + interval '1 day')
        where ($3 = '' or r.name ilike '%' || $3 || '%' or r.phone ilike '%' || $3 || '%')
        group by r.id
        order by r.is_active desc, r.name`,
      [from, to, query],
    );

  const riders: RiderRow[] = riderRows.map((row) => ({
    id: asText(row.id),
    name: asText(row.name),
    phone: asText(row.phone),
    active: row.is_active === true || row.is_active === "t",
    deliveries: Number(row.deliveries ?? 0),
    deliveryValue: Number(row.delivery_value ?? 0),
    lastDelivery: row.last_delivery ? asText(row.last_delivery) : null,
  }));


  const active = riders.filter((r) => r.active);
  const deliveryCount = riders.reduce((sum, r) => sum + r.deliveries, 0);
  const totalValue = riders.reduce((sum, r) => sum + r.deliveryValue, 0);

  const columns: DataColumn<RiderRow>[] = [
    {
      key: "rider",
      header: "Rider",
      priority: 1,
      cell: (rider) => (
        <span className="block">
          <span className="block font-medium text-ink">{rider.name}</span>
          <a
            className="relative z-20 block w-fit text-xs text-orange-700 hover:underline"
            href={`tel:${rider.phone}`}
          >
            {rider.phone}
          </a>
        </span>
      ),
    },
    {
      key: "deliveries",
      header: "Deliveries",
      align: "right",
      num: true,
      priority: 2,
      cell: (rider) => rider.deliveries,
    },
    {
      key: "value",
      header: "Delivered value",
      align: "right",
      num: true,
      priority: 3,
      cell: (rider) => formatKsh(rider.deliveryValue),
    },
    {
      key: "last",
      header: "Last delivery",
      priority: 3,
      cell: (rider) => (
        <span className="whitespace-nowrap text-ink-subtle">{deliveryDate(rider.lastDelivery)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      priority: 3,
      cell: (rider) =>
        rider.active ? (
          <StatusBadge tone="ok">Active</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Inactive</StatusBadge>
        ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      cell: (rider) => (
        <form action={setRiderActive}>
          <input type="hidden" name="id" value={rider.id} />
          <input type="hidden" name="active" value={rider.active ? "false" : "true"} />
          <Button type="submit" variant={rider.active ? "danger" : "secondary"} size="sm">
            {rider.active ? "Deactivate" : "Reactivate"}
          </Button>
        </form>
      ),
    },
  ];

  return (
    <>
      <SavedToast key={params.saved ?? "none"} message={params.saved ?? null} />
      <AppShell
        title="Riders"
        subtitle={`Delivery team · ${from} to ${to}`}
        staff={currentStaff}
        branch={stationName}
        activeHref="/riders"
      >
        <PageHeader
          title="Riders"
          subtitle="Delivery team performance and activity"
          action={
            <ButtonLink href={showNewForm ? "/riders" : "/riders?new=1"} variant="primary">
              {showNewForm ? "Close" : "New rider"}
            </ButtonLink>
          }
        />

        {notice ? <Banner tone="warn">{notice}</Banner> : null}
        {params.error ? <Banner tone="bad">{params.error}</Banner> : null}

        {showNewForm ? (
          <Card title="New rider" subtitle="Riders can deliver from any branch; branch stock stays at the sale's branch.">
            <form action={createRider} className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-ink-subtle">Full name</span>
                <input
                  className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  name="name"
                  required
                  minLength={2}
                  autoComplete="name"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-ink-subtle">Phone</span>
                <input
                  className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  name="phone"
                  required
                  minLength={7}
                  inputMode="tel"
                  autoComplete="tel"
                />
              </label>
              <div className="sm:col-span-3">
                <Button type="submit" variant="primary">Create rider</Button>
              </div>
            </form>
          </Card>
        ) : null}

        {/* KPI summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="Active riders"
            value={String(active.length)}
            subtext={`${riders.length - active.length} inactive`}
          />
          <KpiCard
            label="Deliveries"
            value={String(deliveryCount)}
            subtext={`${from} → ${to}`}
          />
          <KpiCard
            label="Delivered value"
            value={formatKsh(totalValue)}
            subtext="Posted rider-assigned sales"
          />
        </div>

        {/* Date-range + search filter */}
        <FilterBar
          search={
            <form action="/riders" method="get" role="search" className="flex flex-wrap gap-2">
              <SearchInput
                name="q"
                defaultValue={query}
                placeholder="Name, phone or branch"
                label="Search riders"
              />
              <div className="flex items-center gap-1">
                <label className="sr-only" htmlFor="riders-from">From</label>
                <input
                  id="riders-from"
                  type="date"
                  name="from"
                  defaultValue={from}
                  max={to}
                  className="h-10 rounded-md border border-border bg-surface px-2 text-sm"
                />
                <span className="text-sm text-ink-subtle">to</span>
                <label className="sr-only" htmlFor="riders-to">To</label>
                <input
                  id="riders-to"
                  type="date"
                  name="to"
                  defaultValue={to}
                  min={from}
                  max={today}
                  className="h-10 rounded-md border border-border bg-surface px-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="h-10 rounded-md bg-orange-500 px-4 text-sm font-semibold text-white"
              >
                Apply
              </button>
            </form>
          }
          filters={
            <p className="text-sm text-ink-subtle">
              {riders.length} rider{riders.length === 1 ? "" : "s"} · {from} to {to}
            </p>
          }
        />

        <Card flush>
          <DataTable
            rows={riders}
            columns={columns}
            rowKey={(rider) => rider.id}
            caption="Riders and their delivery activity"
            empty={
              <EmptyState
                icon={TruckIcon}
                title={query ? `No rider matches "${query}"` : "No riders yet"}
                description={
                  query
                    ? "Try a rider name, phone number, or branch."
                    : "Create the first rider before assigning deliveries."
                }
                action={
                  <ButtonLink href="/riders?new=1" variant="primary">New rider</ButtonLink>
                }
              />
            }
          />
        </Card>
      </AppShell>
    </>
  );
}
