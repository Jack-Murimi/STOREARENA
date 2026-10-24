"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/db";
import { currentStaffAccess, type StaffAccess } from "@/lib/auth";
import { StockError } from "@/lib/stock/stock-db";

const text = (form: FormData, key: string): string => String(form.get(key) ?? "").trim();

function withMessage(backTo: string, key: "saved" | "error", message: string): string {
  const url = new URL(backTo, "http://portal.local");
  url.searchParams.set(key, message);
  return `${url.pathname}${url.search}`;
}

function fail(error: unknown, backTo = "/stock-counts"): never {
  const message =
    error instanceof StockError
      ? error.message
      : "That could not be saved. Check the details and try again.";
  redirect(withMessage(backTo, "error", message));
}

async function requireManagerAccess(): Promise<StaffAccess> {
  const staff = await currentStaffAccess();
  if (!staff) fail(new StockError("NO_ACTOR", "Your signed-in staff profile is required."));
  const allowed = staff.role === "manager" || staff.role === "admin" || staff.role === "director";
  if (!allowed) {
    fail(new StockError("FORBIDDEN", "Only a Manager, Admin or Director can resolve variances."));
  }
  return staff;
}

async function requireAdminAccess(): Promise<StaffAccess> {
  const staff = await currentStaffAccess();
  if (!staff) fail(new StockError("NO_ACTOR", "Your signed-in staff profile is required."));
  const allowed = staff.role === "admin" || staff.role === "director";
  if (!allowed) {
    fail(new StockError("FORBIDDEN", "Only an Admin or Director can apply a stocktake correction."));
  }
  return staff;
}

/** Marks a shift_count as resolved by a manager or above. */
export async function resolveVariance(form: FormData): Promise<void> {
  const staff = await requireManagerAccess();
  const id = text(form, "id");
  if (!id) fail(new StockError("BAD_ID", "Shift count ID is required."));

  const resolvedNote = text(form, "resolved_note") || null;

  const { products } = await getCustomerContext();
  if (!products) fail(new StockError("NO_DB", "No database connection. Set DATABASE_URL and redeploy."));

  try {
    const result = await products.db.query(
      `UPDATE shift_counts
          SET resolved      = true,
              resolved_by   = $1,
              resolved_at   = now(),
              resolved_note = $2
        WHERE id = $3
        RETURNING id`,
      [staff.fullName, resolvedNote, id],
    );
    if (!Array.isArray(result) || result.length === 0) {
      throw new StockError("NOT_FOUND", "That shift count was not found.");
    }
  } catch (error) {
    fail(error);
  }

  revalidatePath("/stock-counts");
  redirect("/stock-counts?saved=Variance+marked+as+reviewed");
}

/** Writes a STOCKTAKE correction for both REFILL and EMPTY states, then resolves the shift count. */
export async function applyStocktake(form: FormData): Promise<void> {
  const staff = await requireAdminAccess();
  const shiftCountId = text(form, "shift_count_id");
  const locationId = text(form, "location_id");
  const variantId = text(form, "variant_id");
  const countedRefills = Number(text(form, "counted_refills") || "0");
  const countedEmpties = Number(text(form, "counted_empties") || "0");
  const reason = text(form, "reason");

  if (!shiftCountId || !locationId || !variantId) {
    fail(new StockError("BAD_INPUT", "Shift count, location and variant are required."));
  }
  if (reason.length < 5) {
    fail(new StockError("BAD_REASON", "Reason must be at least 5 characters."));
  }
  if (!Number.isInteger(countedRefills) || countedRefills < 0) {
    fail(new StockError("BAD_COUNT", "Counted refills must be a whole number of zero or more."));
  }
  if (!Number.isInteger(countedEmpties) || countedEmpties < 0) {
    fail(new StockError("BAD_COUNT", "Counted empties must be a whole number of zero or more."));
  }

  const { products } = await getCustomerContext();
  if (!products) fail(new StockError("NO_DB", "No database connection. Set DATABASE_URL and redeploy."));

  try {
    await products.db.transaction(async (tx) => {
      const now = new Date().toISOString();

      for (const [state, counted] of [
        ["REFILL", countedRefills],
        ["EMPTY", countedEmpties],
      ] as [string, number][]) {
        const rows = await tx.query<{ quantity: number }>(
          "SELECT quantity FROM inventory_positions WHERE location_id = $1 AND variant_id = $2 AND state = $3",
          [locationId, variantId, state],
        );
        const current = rows.length > 0 ? Number(rows[0].quantity) : 0;

        if (counted !== current) {
          const delta = counted - current;

          await tx.query(
            `INSERT INTO stock_movements
               (ledger_kind, operation, occurred_at, location_id, variant_id,
                state, quantity, balance_before, balance_after,
                reason, reference, actor, unit_cost_ksh, idempotency_key,
                channel, counterparty_location_id, custody)
             VALUES ($1,'STOCKTAKE',$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10,NULL,NULL,'INTERNAL',NULL,NULL)`,
            [
              "GAS",
              now,
              locationId,
              variantId,
              state,
              delta,
              current,
              counted,
              reason,
              staff.fullName,
            ],
          );

          await tx.query(
            `INSERT INTO inventory_positions (location_id, variant_id, state, quantity, updated_at)
             VALUES ($1, $2, $3, $4, now())
             ON CONFLICT (location_id, variant_id, state)
             DO UPDATE SET quantity = $4, updated_at = now()`,
            [locationId, variantId, state, counted],
          );
        }
      }

      // Mark the shift count resolved after applying the correction.
      await tx.query(
        `UPDATE shift_counts
            SET resolved      = true,
                resolved_by   = $1,
                resolved_at   = now(),
                resolved_note = $2
          WHERE id = $3`,
        [staff.fullName, `Stocktake applied: ${reason}`, shiftCountId],
      );
    });
  } catch (error) {
    fail(error);
  }

  revalidatePath("/stock-counts");
  redirect("/stock-counts?saved=Stock+adjusted");
}
