"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/db";
import { canViewBilling, currentStaffAccess } from "@/lib/auth";

export interface PurchaseFormState {
  error?: string;
}

export async function createPurchase(
  _prev: PurchaseFormState,
  formData: FormData,
): Promise<PurchaseFormState> {
  const staff = await currentStaffAccess();
  if (!staff) return { error: "Your signed-in staff profile is required." };
  if (!canViewBilling(staff)) {
    return { error: "Only a manager can raise a purchase invoice." };
  }

  const { products } = await getCustomerContext();
  if (!products) return { error: "The database is not reachable." };

  let lines: unknown;
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "The line items could not be read." };
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: "Add at least one line." };
  }

  const payload = {
    supplier_id: String(formData.get("supplier_id") ?? ""),
    branch_id: String(formData.get("branch_id") ?? ""),
    invoice_no: String(formData.get("invoice_no") ?? "").trim(),
    invoice_date: String(formData.get("invoice_date") ?? ""),
    due_date: String(formData.get("due_date") ?? "") || null,
    vat_rate: Number(formData.get("vat_rate") ?? 0),
    notes: String(formData.get("notes") ?? "") || null,
    actor: staff.fullName,
    lines,
  };

  const claims = JSON.stringify({ sub: staff.id, role: "authenticated" });
  let newId: string | null = null;
  try {
    const rows = await products.db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
      // The payload is passed as an object, not a stringified one. A string
      // gets JSON-encoded a second time on the way in, arrives as a jsonb
      // scalar, and every ->> extraction returns null - which against a
      // financial write fails silently rather than loudly.
      const r = await tx.query<{ id: string }>(
        "select public.create_purchase_invoice($1::jsonb) as id",
        [payload],
      );
      return r;
    });
    newId = rows[0]?.id ?? null;
    if (!newId) return { error: "The invoice was not created." };
    revalidatePath("/purchases");
  } catch (error) {
    return { error: (error as Error).message.split("\n")[0] };
  }
  redirect(`/purchases/${newId}?saved=1`);
}

export type PaymentState = { ok: boolean; error?: string };

/**
 * supplier_payments.method is constrained to lowercase codes - cash, mpesa,
 * bank, cheque. The customer domain uses display labels like "M-Pesa", and the
 * check constraint rejects them. This map is the only place the translation
 * happens; see docs/PURCHASES_GOTCHAS.md.
 */
const METHOD_CODES = ["cash", "mpesa", "bank", "cheque"] as const;

export async function recordPayment(
  _prev: PaymentState,
  formData: FormData,
): Promise<PaymentState> {
  const staff = await currentStaffAccess();
  if (!staff) return { ok: false, error: "Your signed-in staff profile is required." };
  if (!canViewBilling(staff)) {
    return { ok: false, error: "Only a manager can record supplier payments." };
  }

  const invoiceId = String(formData.get("invoice_id") ?? "");
  const supplierId = String(formData.get("supplier_id") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  const method = String(formData.get("method") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const paidOn = String(formData.get("paid_on") ?? "").trim() || null;

  if (!METHOD_CODES.includes(method as (typeof METHOD_CODES)[number])) {
    return { ok: false, error: "Pick a payment method." };
  }
  // The column has check (amount > 0); failing here gives a usable message
  // instead of a constraint violation.
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  const { products, notice } = await getCustomerContext();
  if (!products) return { ok: false, error: notice ?? "Database unavailable" };

  try {
    // Lock the invoice for the check-and-insert. Read-then-write outside a
    // transaction let two payments both pass the outstanding test and leave the
    // invoice overpaid.
    await products.db.transaction(async (tx) => {
      const locked = await tx.query<{ id: string }>(
        "select id from purchase_invoices where id = $1 and supplier_id = $2 and status <> 'void' for update",
        [invoiceId, supplierId],
      );
      if (!locked[0]) throw new Error("That invoice does not belong to this supplier.");

      const rows = await tx.query<{ amount_due: string }>(
        "select coalesce(amount_due, 0) as amount_due from invoice_payment_status where id = $1",
        [invoiceId],
      );
      const outstanding = Number(rows[0]?.amount_due ?? 0);
      if (amount > outstanding + 0.001) {
        throw new Error(
          `That is more than the ${outstanding.toFixed(2)} still outstanding on this invoice.`,
        );
      }

      await tx.query(
        `insert into supplier_payments
           (supplier_id, invoice_id, branch_id, paid_on, amount, method, reference, status, created_by)
         values ($1, $2, $3, coalesce($4::date, current_date), $5, $6, $7, 'posted', $8)`,
        [supplierId, invoiceId, branchId, paidOn, amount, method, reference, staff.id],
      );
    });
    revalidatePath("/purchases");
    revalidatePath(`/purchases/${invoiceId}`);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message.split("\n")[0] : "Could not record the payment";
    return { ok: false, error: message };
  }
}
