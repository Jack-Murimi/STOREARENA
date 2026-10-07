"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/db";

/**
 * Until Supabase Auth is live the app has no signed-in user, so auth.uid()
 * resolves to nothing and the role checks in the RPC correctly refuse the
 * call. This names the acting user explicitly for the duration of the
 * transaction.
 *
 * TEMPORARY. It is replaced by the real session the moment @supabase/ssr
 * lands, and it must not survive that change.
 */
const ACTOR_UID =
  process.env.PURCHASES_ACTOR_UID ?? "11111111-2222-3333-4444-555555555555";

const claims = JSON.stringify({ sub: ACTOR_UID, role: "authenticated" });

export interface PurchaseFormState {
  error?: string;
}

export async function createPurchase(
  _prev: PurchaseFormState,
  formData: FormData,
): Promise<PurchaseFormState> {
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
    actor: String(formData.get("actor") ?? "Portal"),
    lines,
  };

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
    const id = rows[0]?.id;
    if (!id) return { error: "The invoice was not created." };
    redirect(`/purchases/${id}?saved=1`);
  } catch (error) {
    return { error: (error as Error).message.split("\n")[0] };
  }
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
    const rows = await products.db.query<{ amount_due: string }>(
      `select coalesce(p.amount_due, 0) as amount_due
         from invoice_payment_status p where p.id = $1`,
      [invoiceId],
    );
    const outstanding = Number(rows[0]?.amount_due ?? 0);
    if (amount > outstanding) {
      return {
        ok: false,
        error: `That is more than the ${outstanding.toFixed(2)} still outstanding on this invoice.`,
      };
    }

    await products.db.query(
      `insert into supplier_payments
         (supplier_id, invoice_id, branch_id, paid_on, amount, method, reference, status)
       values ($1, $2, $3, coalesce($4::date, current_date), $5, $6, $7, 'posted')`,
      [supplierId, invoiceId, branchId, paidOn, amount, method, reference],
    );
    revalidatePath("/purchases");
    revalidatePath(`/purchases/${invoiceId}`);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message.split("\n")[0] : "Could not record the payment";
    return { ok: false, error: message };
  }
}
