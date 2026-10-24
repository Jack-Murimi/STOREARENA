import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SavedToast } from "@/components/customers/SavedToast";
import { ShiftCountForm } from "@/components/inventory/ShiftCountForm";
import type { ShiftCountProduct } from "@/components/inventory/ShiftCountForm";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { currentStaffAccess } from "@/lib/auth";

export const metadata: Metadata = { title: "Shift Count" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function str(v: unknown) {
  return typeof v === "string" ? v : "";
}

export default async function ShiftCountPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const saved = str(params.saved) || null;
  const error = str(params.error) || null;
  const branchParam = str(params.branch);

  const staffAccess = await currentStaffAccess();
  if (!staffAccess || staffAccess.role === "rider") redirect("/");

  const { products } = await getCustomerContext();
  if (!products) redirect("/");

  const db = products.db;

  // Resolve which branches this staff member can count at
  const allLocations = await products.listLocations();
  const grantedBranches =
    staffAccess.role === "admin" || staffAccess.role === "director"
      ? allLocations.filter((l) => l.kind === "BRANCH")
      : allLocations.filter(
          (l) => l.kind === "BRANCH" && staffAccess.branchIds.includes(l.id),
        );

  if (grantedBranches.length === 0) redirect("/");

  // Determine active branch
  const activeBranch =
    grantedBranches.find((b) => b.id === branchParam) ?? grantedBranches[0];

  const countDate = new Date().toISOString().slice(0, 10);

  // Fetch CYLINDER products with their current ledger positions for this branch
  const rows = await db.query<{
    variant_id: string;
    variant_name: string;
    brand_name: string;
    size_kg: number | null;
    ledger_refills: number;
    ledger_empties: number;
  }>(
    `SELECT
       pv.id              AS variant_id,
       pv.name            AS variant_name,
       b.name             AS brand_name,
       pv.size_kg,
       COALESCE(ip_r.quantity, 0)::int AS ledger_refills,
       COALESCE(ip_e.quantity, 0)::int AS ledger_empties
     FROM product_variants pv
     JOIN brands b ON b.id = pv.brand_id
     JOIN categories c ON c.id = pv.category_id
     LEFT JOIN inventory_positions ip_r
       ON ip_r.variant_id = pv.id
      AND ip_r.location_id = $1
      AND ip_r.state = 'REFILL'
     LEFT JOIN inventory_positions ip_e
       ON ip_e.variant_id = pv.id
      AND ip_e.location_id = $1
      AND ip_e.state = 'EMPTY'
     WHERE c.stock_model = 'CYLINDER'
     ORDER BY b.name, pv.size_kg NULLS LAST, pv.name`,
    [activeBranch.id],
  );

  const products_: ShiftCountProduct[] = rows.map((r) => ({
    variantId: r.variant_id,
    variantName: r.variant_name,
    brandName: r.brand_name,
    sizeKg: r.size_kg !== null ? Number(r.size_kg) : null,
    ledgerRefills: Number(r.ledger_refills),
    ledgerEmpties: Number(r.ledger_empties),
  }));

  return (
    <AppShell
      title="Shift Count"
      subtitle={activeBranch.name}
      staff={currentStaff}
      branch={stationName}
      activeHref="/inventory/shift-count"
    >
      <SavedToast key={saved ?? undefined} message={saved} tone="good" />
      <SavedToast key={error ?? undefined} message={error} tone="bad" />

      {/* Branch picker — only shown if staff can see multiple branches */}
      {grantedBranches.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {grantedBranches.map((branch) => (
            <a
              key={branch.id}
              href={`/inventory/shift-count?branch=${branch.id}`}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                branch.id === activeBranch.id
                  ? "bg-flame-500 text-white shadow-sm"
                  : "bg-white text-ink ring-1 ring-line hover:bg-canvas"
              }`}
            >
              {branch.name}
            </a>
          ))}
        </div>
      )}

      {/* Heading */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink">
          Your count for{" "}
          <span className="text-flame-600">{activeBranch.name}</span>
        </h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          {new Date(countDate).toLocaleDateString("en-KE", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {products_.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-8 text-center">
          <p className="text-sm text-ink-soft">
            No cylinder products found for this branch.
          </p>
        </div>
      ) : (
        <ShiftCountForm
          products={products_}
          locationId={activeBranch.id}
          branchName={activeBranch.name}
          countDate={countDate}
        />
      )}
    </AppShell>
  );
}
