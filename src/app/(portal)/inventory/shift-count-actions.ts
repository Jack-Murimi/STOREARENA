"use server";

import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/db";
import { currentStaffAccess } from "@/lib/auth";

const BACK = "/inventory/shift-count";

function fail(msg: string): never {
  redirect(`${BACK}?error=${encodeURIComponent(msg)}`);
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

interface Entry {
  variantId: string;
  refills: number;
  empties: number;
}

export async function saveShiftCount(form: FormData): Promise<void> {
  const staff = await currentStaffAccess();
  if (!staff) redirect("/login");
  if (staff.role === "rider") fail("Riders cannot submit shift counts.");

  const { products } = await getCustomerContext();
  if (!products) fail("Database unavailable.");

  const db = products.db;
  const locationId = text(form, "location_id");
  if (!locationId) fail("Select a branch before submitting.");

  const countDate =
    text(form, "count_date") || new Date().toISOString().slice(0, 10);
  const note = text(form, "note") || null;

  let entries: Entry[];
  try {
    const raw: unknown = JSON.parse(text(form, "entries"));
    if (!Array.isArray(raw) || raw.length === 0) throw new Error();
    entries = (raw as Array<{ variantId: string; refills: unknown; empties: unknown }>).map(
      (e) => ({
        variantId: String(e.variantId),
        refills: Math.max(0, Math.round(Number(e.refills) || 0)),
        empties: Math.max(0, Math.round(Number(e.empties) || 0)),
      }),
    );
  } catch {
    fail("Count entries could not be read. Try again.");
  }

  try {
    for (const entry of entries!) {
      const [refillRows, emptyRows] = await Promise.all([
        db.query<{ quantity: number }>(
          "SELECT quantity FROM inventory_positions WHERE location_id=$1 AND variant_id=$2 AND state='REFILL'",
          [locationId, entry.variantId],
        ),
        db.query<{ quantity: number }>(
          "SELECT quantity FROM inventory_positions WHERE location_id=$1 AND variant_id=$2 AND state='EMPTY'",
          [locationId, entry.variantId],
        ),
      ]);

      const ledgerRefills = refillRows.length ? Number(refillRows[0].quantity) : 0;
      const ledgerEmpties = emptyRows.length ? Number(emptyRows[0].quantity) : 0;

      await db.query(
        `INSERT INTO shift_counts
           (location_id, variant_id, counted_by, count_date, refills, empties, ledger_refills, ledger_empties, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          locationId,
          entry.variantId,
          staff.fullName,
          countDate,
          entry.refills,
          entry.empties,
          ledgerRefills,
          ledgerEmpties,
          note,
        ],
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not save count.";
    fail(msg);
  }

  redirect(`${BACK}?saved=${encodeURIComponent("Count saved")}`);
}
