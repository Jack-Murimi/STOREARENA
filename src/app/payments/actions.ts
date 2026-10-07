"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/db";

export type AllocateState = { ok: boolean; error?: string };

const METHOD_CODES = ["cash", "mpesa", "bank", "cheque"] as const;

/**
 * One payment, many invoices, remainder kept as credit. The payment row is
 * written with no invoice_id - the money belongs to the allocations. Whatever
 * is not allocated stays unallocated on supplier_credit and can be allocated
 * later against a new invoice.
 */
export async function recordAllocatedPayment(
  _prev: AllocateState,
  formData: FormData,
): Promise<AllocateState> {
  const supplierId = String(formData.get("supplier_id") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  const method = String(formData.get("method") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const paidOn = String(formData.get("paid_on") ?? "").trim() || null;

  if (!METHOD_CODES.includes(method as (typeof METHOD_CODES)[number])) {
    return { ok: false, error: "Pick a payment method." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }

  const wanted: { invoiceId: string; amount: number }[] = [];
  formData.forEach((v, k) => {
    if (!k.startsWith("alloc_")) return;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) wanted.push({ invoiceId: k.slice(6), amount: n });
  });
  const allocated = wanted.reduce((s, w) => s + w.amount, 0);
  if (allocated > amount + 0.001) {
    return {
      ok: false,
      error: `You have allocated ${allocated.toFixed(2)} of a ${amount.toFixed(2)} payment.`,
    };
  }

  const { products, notice } = await getCustomerContext();
  if (!products) return { ok: false, error: notice ?? "Database unavailable" };

  try {
    const id = await products.db.transaction(async (tx) => {
      const rows = await tx.query<{ id: string }>(
        `insert into supplier_payments
           (supplier_id, invoice_id, branch_id, paid_on, amount, method, reference, status)
         values ($1, null, $2, coalesce($3::date, current_date), $4, $5, $6, 'posted')
         returning id`,
        [supplierId, branchId, paidOn, amount, method, reference],
      );
      const paymentId = rows[0].id;
      for (const w of wanted) {
        await tx.query(
          `insert into supplier_payment_allocations (payment_id, invoice_id, amount, allocated_on)
           values ($1, $2, $3, coalesce($4::date, current_date))`,
          [paymentId, w.invoiceId, w.amount, paidOn],
        );
      }
      return paymentId;
    });
    revalidatePath("/payments");
    revalidatePath(`/suppliers/${supplierId}`);
    redirect(`/payments/${id}`);
  } catch (e) {
    const message = e instanceof Error ? e.message.split("\n")[0] : "Could not record the payment";
    return { ok: false, error: message };
  }
}
