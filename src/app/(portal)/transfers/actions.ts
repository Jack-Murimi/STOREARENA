"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/db";
import { canTransferFrom, currentStaffAccess } from "@/lib/auth";

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
  const staff = await currentStaffAccess();
  if (!staff) redirect(`/transfers?error=${encodeURIComponent("Your signed-in staff profile is required.")}`);
  if (!canTransferFrom(staff, from)) {
    redirect(`/transfers?error=${encodeURIComponent("You can only send stock from a branch assigned to you.")}`);
  }
  const variants = form.getAll("variant_id").map(String);
  const refills = quantities(form, "refills_sent");
  const emptiesSent = quantities(form, "empties_sent");
  const emptiesReturned = quantities(form, "empties_returned");
  const lines = variants.map((variant_id, index) => ({ variant_id, refills_sent: refills[index] ?? 0, empties_sent: emptiesSent[index] ?? 0, empties_returned: emptiesReturned[index] ?? 0 }));
  const payload = {
    workflow, from_branch_id: from, to_branch_id: to,
    delivery_note: value(form, "delivery_note") || null, notes: value(form, "notes") || null,
    actor: staff.fullName,
    // Supplied by the form and generated once per render, so a double-click or
    // a retried request replays one transfer instead of moving stock twice.
    idempotency_key: value(form, "idempotency_key") || randomUUID(), lines,
  };
  let savedMessage = "";
  try {
    const claims = JSON.stringify({ sub: staff.id, role: "authenticated" });
    const result = await products.db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
      return tx.query<{ create_stock_transfer: { transfer_no: string } }>(
        "select public.create_stock_transfer($1::jsonb)",
        [payload],
      );
    });
    const transfer = result[0]?.create_stock_transfer;
    revalidatePath("/transfers"); revalidatePath("/inventory"); revalidatePath("/reports");
    savedMessage = `Transfer ${transfer?.transfer_no ?? ""} posted.`;
  } catch (error) {
    const raw = (error as Error).message;
    const message = Object.entries(errors).find(([key]) => raw.includes(key))?.[1] ?? "The transfer could not be posted. Check the quantities and try again.";
    redirect(`/transfers?error=${encodeURIComponent(message)}`);
  }
  redirect(`/transfers?saved=${encodeURIComponent(savedMessage)}`);
}
