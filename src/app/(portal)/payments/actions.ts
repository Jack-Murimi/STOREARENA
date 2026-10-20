"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/db";
import { canViewBilling, currentStaffAccess } from "@/lib/auth";

export type AllocateState = { ok: boolean; error?: string };

const METHOD_CODES = ["cash", "mpesa", "bank", "cheque"] as const;

/**
 * One payment, many invoices, remainder kept as credit. The payment row is
 * written with no invoice_id - the money belongs to the allocations. Whatever
 * is not allocated stays unallocated on supplier_credit and can be allocated
 * later against a new invoice.
 *
 * Every allocation is checked against the supplier's own open invoices, inside
 * the same transaction, with the invoice rows locked. The old code inserted
 * whatever `alloc_<id>` fields the browser posted: an invoice belonging to a
 * different supplier, or one already paid, could be "settled" from this
 * payment, and two concurrent payments could both allocate to the same balance.
 */
export async function recordAllocatedPayment(
  _prev: AllocateState,
  formData: FormData,
): Promise<AllocateState> {
  const staff = await currentStaffAccess();
  if (!staff) return { ok: false, error: "Your signed-in staff profile is required." };
  if (!canViewBilling(staff)) {
    return { ok: false, error: "Only a manager can record supplier payments." };
  }

  const supplierId = String(formData.get("supplier_id") ?? "").trim();
  const branchId = String(formData.get("branch_id") ?? "").trim();
  const method = String(formData.get("method") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const paidOn = String(formData.get("paid_on") ?? "").trim() || null;

  if (!supplierId) return { ok: false, error: "Choose a supplier." };
  if (!branchId) return { ok: false, error: "Choose the branch this payment belongs to." };
  if (!METHOD_CODES.includes(method as (typeof METHOD_CODES)[number])) {
    return { ok: false, error: "Pick a payment method." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  // This domain has no card payments (see docs/PURCHASES_GOTCHAS.md), so a
  // reference is optional - but an M-Pesa code is useful for reconciliation.
  if (method === "mpesa" && !reference) {
    return { ok: false, error: "Add the M-Pesa reference for the payment." };
  }

  const wanted: { invoiceId: string; amount: number }[] = [];
  formData.forEach((value, key) => {
    if (!key.startsWith("alloc_")) return;
    const invoiceId = key.slice(6);
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) wanted.push({ invoiceId, amount: parsed });
  });
  const allocated = wanted.reduce((sum, entry) => sum + entry.amount, 0);
  if (allocated > amount + 0.001) {
    return {
      ok: false,
      error: `You have allocated ${allocated.toFixed(2)} of a ${amount.toFixed(2)} payment.`,
    };
  }

  const { products, notice } = await getCustomerContext();
  if (!products) return { ok: false, error: notice ?? "Database unavailable" };

  try {
    await products.db.transaction(async (tx) => {
      // The branch must be a real, active branch - the old code took the first
      // active location on the page and never showed it to the user.
      const branch = await tx.query<{ id: string }>(
        "select id from stock_locations where id = $1 and kind = 'BRANCH' and active",
        [branchId],
      );
      if (!branch[0]) throw new Error("Choose an active branch for this payment.");

      const supplier = await tx.query<{ id: string }>(
        "select id from suppliers where id = $1 and is_active",
        [supplierId],
      );
      if (!supplier[0]) throw new Error("That supplier is no longer active.");

      if (wanted.length > 0) {
        const invoiceIds = wanted.map((entry) => entry.invoiceId);
        const open = await tx.query<{ id: string; amount_due: number }>(
          `select i.id, coalesce(s.amount_due, 0)::numeric as amount_due
             from purchase_invoices i
             left join invoice_payment_status s on s.id = i.id
            where i.id = any($1::uuid[])
              and i.supplier_id = $2
              and i.status <> 'void'
              for update of i`,
          [invoiceIds, supplierId],
        );
        const dueById = new Map(open.map((row) => [String(row.id), Number(row.amount_due)]));
        for (const entry of wanted) {
          const due = dueById.get(entry.invoiceId);
          if (due === undefined) {
            throw new Error("One of the invoices does not belong to this supplier.");
          }
          if (entry.amount > due + 0.001) {
            throw new Error(
              `An allocation is more than that invoice still owes (${due.toFixed(2)}).`,
            );
          }
        }
        if (new Set(invoiceIds).size !== invoiceIds.length) {
          throw new Error("Each invoice may only be allocated once.");
        }
      }

      const payments = await tx.query<{ id: string }>(
        `insert into supplier_payments
           (supplier_id, invoice_id, branch_id, paid_on, amount, method, reference, status, created_by)
         values ($1, null, $2, coalesce($3::date, current_date), $4, $5, $6, 'posted', $7)
         returning id`,
        [supplierId, branchId, paidOn, amount, method, reference, staff.id],
      );
      const paymentId = payments[0].id;
      for (const entry of wanted) {
        await tx.query(
          `insert into supplier_payment_allocations
             (payment_id, invoice_id, amount, allocated_on, created_by)
           values ($1, $2, $3, coalesce($4::date, current_date), $5)`,
          [paymentId, entry.invoiceId, entry.amount, paidOn, staff.id],
        );
      }
    });
    revalidatePath("/payments");
    revalidatePath(`/suppliers/${supplierId}`);
    revalidatePath("/purchases");
  } catch (error) {
    const message = (error as Error).message.split("\n")[0];
    return { ok: false, error: message || "Could not record the payment." };
  }
  redirect(`/payments?saved=Payment+recorded`);
}
