"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/db";

const value = (form: FormData, key: string) => typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
const quantities = (form: FormData, key: string): number[] => form.getAll(key).map((entry) => Math.max(0, Math.floor(Number(String(entry) || 0))));

const errors: Record<string, string> = {
  transfer_workflow_invalid: "Choose a transfer workflow.", transfer_branches_invalid: "Choose two different active branches.",
  transfer_needs_lines: "Add a cylinder line to the transfer.", transfer_line_invalid: "Quantities must be whole, non-negative numbers.",
  stock_move_quantities_invalid: "A stock move needs refills and/or empties sent; no empties return is used.",
  refill_exchange_quantities_invalid: "A refill exchange needs at least one filled cylinder and no source empties.",
  transfer_variant_must_be_cylinder: "Only cylinder products can be transferred here.",
  transfer_source_refills_insufficient: "The source branch does not have enough refills.",
  transfer_source_empties_insufficient: "The source branch does not have enough empty cylinders.",
  transfer_destination_empties_insufficient: "The receiving branch cannot return that many empty cylinders.",
  transfer_source_cylinders_insufficient: "The source branch does not hold enough company cylinders.",
  transfer_destination_cylinders_insufficient: "The receiving branch does not hold enough cylinders to return.",
};

export async function postTransfer(form: FormData): Promise<void> {
  const { products } = await getCustomerContext();
  if (!products) redirect(`/transfers?error=${encodeURIComponent("The database is unavailable.")}`);
  const workflow = value(form, "workflow");
  const from = value(form, "from_branch_id");
  const to = value(form, "to_branch_id");
  const variants = form.getAll("variant_id").map(String);
  const refills = quantities(form, "refills_sent");
  const emptiesSent = quantities(form, "empties_sent");
  const emptiesReturned = quantities(form, "empties_returned");
  const lines = variants.map((variant_id, index) => ({ variant_id, refills_sent: refills[index] ?? 0, empties_sent: emptiesSent[index] ?? 0, empties_returned: emptiesReturned[index] ?? 0 }));
  const payload = {
    workflow, from_branch_id: from, to_branch_id: to,
    delivery_note: value(form, "delivery_note") || null, notes: value(form, "notes") || null,
    actor: "Portal staff", idempotency_key: randomUUID(), lines,
  };
  try {
    const result = await products.db.query<{ create_stock_transfer: { transfer_no: string } }>("select public.create_stock_transfer($1::jsonb)", [payload]);
    const transfer = result[0]?.create_stock_transfer;
    revalidatePath("/transfers"); revalidatePath("/inventory"); revalidatePath("/reports");
    redirect(`/transfers?saved=${encodeURIComponent(`Transfer ${transfer?.transfer_no ?? ""} posted.`)}`);
  } catch (error) {
    const raw = (error as Error).message;
    const message = Object.entries(errors).find(([key]) => raw.includes(key))?.[1] ?? "The transfer could not be posted. Check the quantities and try again.";
    redirect(`/transfers?error=${encodeURIComponent(message)}`);
  }
}
