import type { ProductVariant, Sale, SaleLine, SalePricing } from "./types";
import { InvalidPriceError } from "./errors";

/** How long a discount explanation has to be to count as one. */
export const MIN_PRICE_REASON_LENGTH = 5;

export interface ResolvedPricing {
  listPriceKsh: number;
  unitPriceKsh: number;
  /** Null when the customer paid exactly list price. */
  discountReason: string | null;
}

/**
 * Turns what the cashier typed into a price we can stand behind.
 *
 * The rule the business asked for: prices may differ from list — discounts are
 * normal — but the difference must be *visible*. So any deviation from list
 * price, up or down, has to carry a reason. A silent discount is rejected.
 */
export function resolvePricing(
  variant: ProductVariant,
  pricing: SalePricing,
): ResolvedPricing {
  const list = pricing.listPriceKsh ?? variant.listPriceKsh;
  if (typeof list !== "number" || !Number.isFinite(list) || list <= 0) {
    throw new InvalidPriceError(
      "listPriceKsh",
      `no usable list price for variant ${variant.id}; pass one explicitly`,
      { variantId: variant.id },
    );
  }

  const unit = pricing.unitPriceKsh ?? list;
  if (typeof unit !== "number" || !Number.isFinite(unit) || unit <= 0) {
    throw new InvalidPriceError("unitPriceKsh", "must be a positive amount", {
      value: unit,
    });
  }

  if (unit === list) {
    return { listPriceKsh: list, unitPriceKsh: unit, discountReason: null };
  }

  const reason = (pricing.discountReason ?? "").trim();
  if (reason.length < MIN_PRICE_REASON_LENGTH) {
    throw new InvalidPriceError(
      "discountReason",
      `charged ${unit} against a list price of ${list}; a reason of at least ` +
        `${MIN_PRICE_REASON_LENGTH} characters is required`,
      { variantId: variant.id, listPriceKsh: list, unitPriceKsh: unit },
    );
  }

  return { listPriceKsh: list, unitPriceKsh: unit, discountReason: reason };
}

export function buildSaleLine(
  variant: ProductVariant,
  quantity: number,
  pricing: SalePricing,
): SaleLine {
  const resolved = resolvePricing(variant, pricing);
  return {
    variantId: variant.id,
    quantity,
    listPriceKsh: resolved.listPriceKsh,
    unitPriceKsh: resolved.unitPriceKsh,
    discountReason: resolved.discountReason,
    listTotalKsh: resolved.listPriceKsh * quantity,
    chargedTotalKsh: resolved.unitPriceKsh * quantity,
  };
}

/**
 * Append-only record of money, kept next to the stock ledger so a sale can
 * always be answered with both: what left the cage, and what it was sold for.
 */
export class SaleLedger {
  private readonly records: Sale[] = [];
  private nextId = 1;

  append(draft: Omit<Sale, "id">): Sale {
    const sale: Sale = { ...draft, id: `SALE-${String(this.nextId++).padStart(6, "0")}` };
    this.records.push(sale);
    return sale;
  }

  get size(): number {
    return this.records.length;
  }

  all(): readonly Sale[] {
    return this.records;
  }

  byLocation(locationId: string): Sale[] {
    return this.records.filter((s) => s.locationId === locationId);
  }

  /** Every sale where somebody paid something other than list price. */
  discounted(): Sale[] {
    return this.records.filter((s) => s.discountKsh !== 0);
  }

  totalChargedKsh(): number {
    return this.records.reduce((sum, s) => sum + s.chargedTotalKsh, 0);
  }

  /** Negative means customers were charged above list somewhere. */
  totalDiscountKsh(): number {
    return this.records.reduce((sum, s) => sum + s.discountKsh, 0);
  }
}
