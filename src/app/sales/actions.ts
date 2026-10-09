"use server";

import { revalidatePath } from "next/cache";
import { getCustomerContext } from "@/lib/db";
import type { SaleLineType } from "@/lib/sales/pos-data";

/**
 * Temporary Auth bridge. Until Supabase Auth lands there is no cookie-backed
 * auth.uid(), so server actions set the seeded director's claims transaction-
 * locally. It is intentionally server-only and is replaced by the session
 * claim in the Auth phase.
 */
const ACTOR_UID = process.env.SALES_ACTOR_UID ?? "11111111-2222-3333-4444-555555555555";
const ACTOR_CLAIMS = JSON.stringify({ sub: ACTOR_UID, role: "authenticated" });

export type PaymentMethod = "cash" | "mpesa" | "bank" | "card";

export interface SaleDraftLineInput {
  variantId: string;
  lineType: SaleLineType;
  quantity: number;
  emptiesReturned?: number;
  emptyBrandId?: string | null;
  requestedUnitPrice?: number | null;
  discountAmount?: number | null;
  priceOverrideReason?: string | null;
}

export interface SalePaymentInput {
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
}

export interface CompleteSaleInput {
  receiptNo: string;
  saleType: "counter" | "delivery";
  saleDate?: string | null;
  customerId?: string | null;
  customerLocationId?: string | null;
  riderId?: string | null;
  creditDueDate?: string | null;
  notes?: string | null;
  confirmLargeQuantity?: boolean;
  idempotencyKey: string;
  lines: SaleDraftLineInput[];
  payments: SalePaymentInput[];
}

export interface SaleReceipt {
  saleId: string;
  receiptNo: string;
  saleDate: string;
  saleType: string;
  total: number;
  amountPaid: number;
  balanceDue: number;
  customerName: string | null;
  lines: { name: string; quantity: number; unitPrice: number; discount: number; lineTotal: number }[];
  payments: { method: string; amount: number; reference: string | null }[];
}

export interface CompleteSaleState {
  error?: string;
  errorCode?: string;
  lineName?: string;
  receipt?: SaleReceipt;
}

const asMoney = (value: unknown): number => Number(value ?? 0);
const clean = (value: string | null | undefined): string | null => {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

function readableError(raw: string): Pick<CompleteSaleState, "error" | "errorCode" | "lineName"> {
  const [code, ...rest] = raw.split(":");
  const lineName = rest.length > 0 ? rest.at(-1) : undefined;
  const copy: Record<string, string> = {
    receipt_no_required: "Enter the receipt number before completing the sale.",
    receipt_no_taken: "That receipt number is already used at this branch.",
    no_lines: "Add at least one item to the cart.",
    quantity_must_be_positive: "Each item needs a quantity above zero.",
    refill_needs_empty_brand: "Choose the brand of the empty cylinder returned.",
    delivery_needs_rider_and_location: "Delivery needs both a rider and a customer location.",
    rider_wrong_branch: "That rider is not assigned to this branch.",
    rider_inactive: "That rider is not active.",
    payment_reference_required: "Add the M-Pesa, bank or card reference.",
    payment_amount_must_be_positive: "Payment amounts must be greater than zero.",
    payments_exceed_total: "Payments cannot be more than the final total.",
    overpaid: "Tendered cash exceeds the final total. Return change before recording it.",
    credit_needs_customer: "Credit needs a customer account and a due date.",
    customer_credit_limit_exceeded: "This sale would exceed the customer credit limit.",
    attendant_cannot_discount: "Your role cannot apply a discount.",
    price_below_allowed_minimum: "The requested price is not allowed.",
    override_needs_reason: "Give a reason for the price override.",
    backdate_needs_manager: "Only a manager can backdate this sale.",
    sale_date_in_future: "A sale cannot be dated in the future.",
    large_quantity_needs_confirmation: "Confirm the unusually large quantity before completing.",
    line_type_not_allowed: "This product cannot be sold using that sale mode.",
  };
  if (code === "only_n_left") {
    return { error: `Only ${rest[0] ?? "0"} left for ${rest.slice(1).join(":")}.`, errorCode: code, lineName };
  }
  if (code === "discount_exceeds_limit") {
    return { error: `The discount requested for ${rest.join(":")} is above your allowed limit.`, errorCode: code, lineName };
  }
  if (code === "no_price_floor_set") {
    return { error: `${rest.join(":")} has no approved price floor, so it cannot be discounted.`, errorCode: code, lineName };
  }
  return { error: copy[code] ?? "The sale could not be completed. Check the highlighted details and try again.", errorCode: code, lineName };
}

/** The only application write path for a completed POS sale. */
export async function completeSale(
  _previous: CompleteSaleState,
  input: CompleteSaleInput,
): Promise<CompleteSaleState> {
  const { products, notice } = await getCustomerContext();
  if (!products) return { error: notice ?? "The database is not reachable." };

  const lines = Array.isArray(input.lines)
    ? input.lines.map((line) => ({
        variant_id: String(line.variantId ?? ""),
        line_type: String(line.lineType ?? "other"),
        quantity: Number(line.quantity),
        empties_returned: Number(line.emptiesReturned ?? 0),
        empty_brand_id: clean(line.emptyBrandId),
        unit_price:
          line.requestedUnitPrice === null || line.requestedUnitPrice === undefined
            ? null
            : Number(line.requestedUnitPrice),
        discount_amount: Number(line.discountAmount ?? 0),
        price_override_reason: clean(line.priceOverrideReason),
      }))
    : [];
  const payments = Array.isArray(input.payments)
    ? input.payments
        .filter((payment) => ["cash", "mpesa", "bank", "card"].includes(payment.method))
        .filter((payment) => Number(payment.amount) > 0)
        .map((payment) => ({
          method: payment.method,
          amount: Number(payment.amount),
          reference: clean(payment.reference),
        }))
    : [];

  const payload = {
    branch_id: process.env.SALES_BRANCH_ID ?? "loc-jam",
    receipt_no: String(input.receiptNo ?? "").trim(),
    sale_type: input.saleType === "delivery" ? "delivery" : "counter",
    sale_date: clean(input.saleDate),
    customer_id: clean(input.customerId),
    customer_location_id: clean(input.customerLocationId),
    rider_id: clean(input.riderId),
    credit_due_date: clean(input.creditDueDate),
    notes: clean(input.notes),
    confirm_large_quantity: input.confirmLargeQuantity === true,
    idempotency_key: String(input.idempotencyKey ?? ""),
    lines,
    payments,
  };

  try {
    const receipt = await products.db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [ACTOR_CLAIMS]);
      const created = await tx.query<{ id: string }>("select public.create_sale($1::jsonb) as id", [payload]);
      const saleId = created[0]?.id;
      if (!saleId) throw new Error("sale_not_created");

      const [header, lineRows, paymentRows] = await Promise.all([
        tx.query<Record<string, unknown>>(
          `select s.id, s.receipt_no, s.sale_date, s.sale_type, s.total, s.amount_paid,
                  s.balance_due, c.name as customer_name
             from sales s left join customers c on c.id = s.customer_id
            where s.id = $1`,
          [saleId],
        ),
        tx.query<Record<string, unknown>>(
          `select pv.name, l.quantity, l.unit_price, l.discount_amount, l.line_total
             from sale_lines l join product_variants pv on pv.id = l.variant_id
            where l.sale_id = $1 order by l.id`,
          [saleId],
        ),
        tx.query<Record<string, unknown>>(
          "select method, amount, reference from sale_payments where sale_id = $1 order by created_at, id",
          [saleId],
        ),
      ]);
      const sale = header[0];
      if (!sale) throw new Error("sale_not_found");
      return {
        saleId: String(sale.id),
        receiptNo: String(sale.receipt_no),
        saleDate: String(sale.sale_date),
        saleType: String(sale.sale_type),
        total: asMoney(sale.total),
        amountPaid: asMoney(sale.amount_paid),
        balanceDue: asMoney(sale.balance_due),
        customerName: clean(sale.customer_name as string | null | undefined),
        lines: lineRows.map((line) => ({
          name: String(line.name),
          quantity: asMoney(line.quantity),
          unitPrice: asMoney(line.unit_price),
          discount: asMoney(line.discount_amount),
          lineTotal: asMoney(line.line_total) - asMoney(line.discount_amount),
        })),
        payments: paymentRows.map((payment) => ({
          method: String(payment.method),
          amount: asMoney(payment.amount),
          reference: clean(payment.reference as string | null | undefined),
        })),
      } satisfies SaleReceipt;
    });
    revalidatePath("/sales");
    revalidatePath("/sales/new");
    revalidatePath("/");
    return { receipt };
  } catch (error) {
    const raw = error instanceof Error ? error.message.split("\n")[0] : "unknown_error";
    return readableError(raw);
  }
}

export interface VoidSaleState {
  error?: string;
  success?: boolean;
}

/** Void through the audited database reversal, never by deleting or editing rows. */
export async function voidSale(
  _previous: VoidSaleState,
  formData: FormData,
): Promise<VoidSaleState> {
  const saleId = String(formData.get("sale_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!saleId) return { error: "This sale could not be identified." };
  if (reason.length < 10) return { error: "Give a void reason of at least 10 characters." };

  const { products, notice } = await getCustomerContext();
  if (!products) return { error: notice ?? "The database is not reachable." };
  try {
    await products.db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [ACTOR_CLAIMS]);
      await tx.query("select public.void_sale($1::uuid, $2)", [saleId, reason]);
    });
    revalidatePath("/sales");
    revalidatePath(`/sales/${saleId}`);
    revalidatePath("/inventory");
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    const raw = error instanceof Error ? error.message.split("\n")[0] : "unknown_error";
    const errors: Record<string, string> = {
      void_needs_admin_or_director: "Only an administrator or director can void a sale.",
      reason_too_short: "Give a void reason of at least 10 characters.",
      already_void: "This sale has already been voided.",
      sale_not_found: "This sale could not be found.",
    };
    return { error: errors[raw] ?? "The sale could not be voided." };
  }
}
