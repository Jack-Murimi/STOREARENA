"use server";

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
