import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { Banner } from "@/components/customers/Form";
import { SavedToast } from "@/components/customers/SavedToast";
import { TruckIcon } from "@/components/icons";
import { Card, DataTable, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { TransferForm } from "./TransferForm";
import { canTransferFrom, currentStaffAccess } from "@/lib/auth";

export const metadata: Metadata = { title: "Stock transfers" };
export const dynamic = "force-dynamic";
const text = (value: unknown) => value === null || value === undefined ? "" : String(value);

type TransferRow = { id: string; number: string; workflow: string; from: string; to: string; note: string | null; actor: string; occurredAt: string; lines: string };
function transferDate(value: string) { return new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date(value)); }

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const { products, notice, diagnostic } = await getCustomerContext();
  if (!products) return <AppShell title="Stock transfers" subtitle="Move stock between branches" staff={currentStaff} branch={stationName} activeHref="/transfers"><DatabaseUnavailable notice={notice} diagnostic={diagnostic} /></AppShell>;
  const [branchRows, variantRows, transferRows, staffAccess] = await Promise.all([
    products.db.query<Record<string, unknown>>("select id, name, code from stock_locations where kind = 'BRANCH' and active order by name"),
    products.db.query<Record<string, unknown>>("select pv.id, pv.name, b.name as brand_name, pv.size_kg from product_variants pv join categories c on c.id=pv.category_id join brands b on b.id=pv.brand_id where c.stock_model = 'CYLINDER' order by pv.size_kg, b.name, pv.name"),
    products.db.query<Record<string, unknown>>(`select t.id, t.transfer_no, t.workflow, f.name as from_name, d.name as to_name, t.delivery_note, t.actor, t.occurred_at, string_agg(pv.name || ' · ' || l.refills_sent || ' refill, ' || l.empties_sent || ' empty sent, ' || l.empties_returned || ' empty returned', E'\n' order by pv.name) as lines from stock_transfers t join stock_locations f on f.id=t.from_branch_id join stock_locations d on d.id=t.to_branch_id join stock_transfer_lines l on l.transfer_id=t.id join product_variants pv on pv.id=l.variant_id group by t.id,f.name,d.name order by t.occurred_at desc limit 100`),
    currentStaffAccess(),
  ]);
  const branches = branchRows.map((row) => ({ id: text(row.id), label: `${text(row.name)} · ${text(row.code)}` }));
  const sourceBranches = staffAccess
    ? branches.filter((branch) => canTransferFrom(staffAccess, branch.id))
    : [];
  const variants = variantRows.map((row) => ({ id: text(row.id), label: `${text(row.brand_name)} ${row.size_kg ? `· ${text(row.size_kg)} kg` : ""} · ${text(row.name)}` }));
  const transfers: TransferRow[] = transferRows.map((row) => ({ id: text(row.id), number: text(row.transfer_no), workflow: text(row.workflow), from: text(row.from_name), to: text(row.to_name), note: row.delivery_note ? text(row.delivery_note) : null, actor: text(row.actor), occurredAt: text(row.occurred_at), lines: text(row.lines) }));
  const columns: DataColumn<TransferRow>[] = [
    { key: "number", header: "Transfer", priority: 1, cell: (row) => <span><span className="code font-semibold">{row.number}</span><span className="block text-xs text-ink-subtle">{transferDate(row.occurredAt)}</span></span> },
    { key: "route", header: "Route", priority: 1, cell: (row) => <span>{row.from}<span className="mx-1 text-ink-subtle">→</span>{row.to}</span> },
    { key: "workflow", header: "Workflow", priority: 2, cell: (row) => <StatusBadge tone={row.workflow === "REFILL_EXCHANGE" ? "warn" : "ok"}>{row.workflow === "REFILL_EXCHANGE" ? "Refill exchange" : "Stock move"}</StatusBadge> },
    { key: "lines", header: "Cylinders", priority: 2, cell: (row) => <span className="whitespace-pre-line text-sm text-ink-muted">{row.lines}</span> },
    { key: "note", header: "Delivery note", priority: 3, cell: (row) => row.note ?? "—" },
    { key: "actor", header: "Posted by", priority: 3, cell: (row) => row.actor },
  ];
  return <><SavedToast key={params.saved ?? "none"} message={params.saved ?? null} /><AppShell title="Stock transfers" subtitle="Branch-to-branch refills and empty cylinders" staff={currentStaff} branch={stationName} activeHref="/transfers"><PageHeader title="Stock transfers" subtitle="Moves post immediately to stock and custody records." />{notice ? <Banner tone="warn">{notice}</Banner> : null}{params.error ? <Banner tone="bad">{params.error}</Banner> : null}
    <Card title="New transfer" subtitle="One transfer number can include multiple cylinder brands and sizes.">{sourceBranches.length > 0 ? <TransferForm branches={branches} sourceBranches={sourceBranches} variants={variants} /> : <p className="text-sm text-ink-muted">Your staff profile has no branch you can transfer stock from.</p>}</Card>
    <Card title="Transfer history" subtitle="Posted transfers are immutable stock records." flush><DataTable rows={transfers} columns={columns} rowKey={(row) => row.id} empty={<EmptyState icon={TruckIcon} title="No transfers yet" description="Post the first branch-to-branch stock move or refill exchange." />} /></Card></AppShell></>;
}
