"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/db";

export type CreateSupplierState = { ok: boolean; error?: string };

export async function createSupplier(
  _prev: CreateSupplierState,
  formData: FormData,
): Promise<CreateSupplierState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { ok: false, error: "Give the supplier a name." };

  const { products, notice } = await getCustomerContext();
  if (!products) return { ok: false, error: notice ?? "Database unavailable" };

  const read = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const terms = Number(formData.get("payment_terms_days") ?? 0);

  try {
    const rows = await products.db.query<{ id: string }>(
      `insert into suppliers (name, kra_pin, email, phone, payment_terms_days)
       values ($1, $2, $3, $4, $5) returning id`,
      [name, read("kra_pin"), read("email"), read("phone"), terms],
    );
    revalidatePath("/suppliers");
    redirect(`/suppliers/${rows[0].id}`);
  } catch (e) {
    const message = e instanceof Error ? e.message.split("\n")[0] : "Could not save";
    return {
      ok: false,
      error: /^duplicate key value/.test(message)
        ? "A supplier with that name already exists."
        : message,
    };
  }
}
