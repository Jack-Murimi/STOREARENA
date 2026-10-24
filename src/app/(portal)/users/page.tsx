import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { Banner } from "@/components/customers/Form";
import { SavedToast } from "@/components/customers/SavedToast";
import { Button, Card, DataTable, PageHeader, StatusBadge } from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { authenticatedStaff } from "@/lib/auth";
import { inviteStaff, sendPasswordReset, updateStaff } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };
const text = (value: unknown) => value == null ? "" : String(value);
type Row = Record<string, unknown>;
const roles = ["attendant", "manager", "director", "admin", "rider"];

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams; const staff = await authenticatedStaff(); const { products, notice, diagnostic } = await getCustomerContext();
  if (!products) return <AppShell title="Users" staff={currentStaff} branch={stationName}><DatabaseUnavailable notice={notice} diagnostic={diagnostic} /></AppShell>;
  if (staff?.role !== "Admin") return <AppShell title="Users" staff={currentStaff} branch={stationName}><Card title="Admin access required"><p className="text-sm text-ink-muted">Only an Admin can create and manage staff accounts.</p></Card></AppShell>;
  const [users, riders, branches] = await Promise.all([
    products.db.query<Row>("select u.id,u.full_name,u.email,u.role,u.is_active,r.id rider_id,string_agg(ub.branch_id,',' order by ub.branch_id) branch_ids from app_users u left join riders r on r.user_id=u.id left join user_branches ub on ub.user_id=u.id group by u.id,r.id order by u.full_name"),
    products.db.query<Row>("select id,name from riders where is_active order by name"),
    products.db.query<Row>("select id,name,code from stock_locations where kind='BRANCH' and active order by name"),
  ]);
  const roleOptions = roles.map((role) => <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>);
  const riderOptions = riders.map((rider) => <option key={text(rider.id)} value={text(rider.id)}>{text(rider.name)}</option>);
  const fields = (row?: Row) => <><label className="block text-xs font-medium text-ink-subtle">Role<select name="role" defaultValue={text(row?.role) || "attendant"} className="mt-1 h-9 w-full rounded border border-border bg-surface px-2 text-sm">{roleOptions}</select></label><label className="block text-xs font-medium text-ink-subtle">Rider profile<select name="rider_id" defaultValue={text(row?.rider_id)} className="mt-1 h-9 w-full rounded border border-border bg-surface px-2 text-sm"><option value="">Not a rider</option>{riderOptions}</select></label><label className="block text-xs font-medium text-ink-subtle">Branches<select name="branch_id" multiple size={Math.min(branches.length, 4)} defaultValue={text(row?.branch_ids).split(",").filter(Boolean)} className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm">{branches.map((branch) => <option key={text(branch.id)} value={text(branch.id)}>{text(branch.name)} · {text(branch.code)}</option>)}</select></label></>;
  const columns: DataColumn<Row>[] = [
    { key: "user", header: "User", priority: 1, cell: (row) => <span><span className="block font-medium">{text(row.full_name)}</span><span className="text-sm text-ink-subtle">{text(row.email)}</span></span> },
    { key: "role", header: "Role", priority: 2, cell: (row) => <span className="capitalize">{text(row.role)}</span> },
    { key: "status", header: "Status", priority: 2, cell: (row) => <StatusBadge tone={row.is_active === true || row.is_active === "t" ? "ok" : "neutral"}>{row.is_active === true || row.is_active === "t" ? "Active" : "Inactive"}</StatusBadge> },
    { key: "manage", header: "", align: "right", cell: (row) => <details className="relative z-20 text-left"><summary className="cursor-pointer text-sm font-semibold text-orange-700">Manage</summary><div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-border bg-surface p-3 shadow-raised"><form action={updateStaff} className="space-y-2"><input type="hidden" name="id" value={text(row.id)} /><label className="block text-xs font-medium text-ink-subtle">Name<input name="name" required minLength={2} defaultValue={text(row.full_name)} className="mt-1 h-9 w-full rounded border border-border px-2 text-sm" /></label>{fields(row)}<label className="flex items-center gap-2 text-sm text-ink"><input name="active" type="checkbox" defaultChecked={row.is_active === true || row.is_active === "t"} />Active account</label><Button type="submit" size="sm">Save access</Button></form><form action={sendPasswordReset} className="mt-3 border-t border-border pt-3"><input type="hidden" name="email" value={text(row.email)} /><Button type="submit" size="sm" variant="secondary">Send password-reset email</Button></form></div></details> },
  ];
  return <><SavedToast key={params.saved ?? "none"} message={params.saved ?? null} /><AppShell title="Users" subtitle="Admin-controlled staff access" staff={currentStaff} branch={stationName} activeHref="/users"><PageHeader title="Users" subtitle="Rider accounts are linked to one rider profile." />{notice ? <Banner tone="warn">{notice}</Banner> : null}{params.error ? <Banner tone="bad">{params.error}</Banner> : null}<Card title="Invite staff member"><form action={inviteStaff} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input required name="name" placeholder="Full name" className="h-10 rounded-md border border-border px-3 text-sm" /><input required type="email" name="email" placeholder="Email address" className="h-10 rounded-md border border-border px-3 text-sm" />{fields()}<div className="sm:col-span-2 lg:col-span-4"><Button type="submit" variant="primary">Send password-set invitation</Button></div></form></Card><Card title="Staff accounts" flush><DataTable rows={users} columns={columns} rowKey={(row) => text(row.id)} /></Card></AppShell></>;
}
