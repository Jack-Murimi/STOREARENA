/**
 * Typed errors for the stock domain.
 *
 * Every failure carries a stable `code` so the API layer can map it to an HTTP
 * status and the UI can localise the message without string matching.
 */

export const StockErrorCode = {
  UnknownCategory: "UNKNOWN_CATEGORY",
  UnknownBrand: "UNKNOWN_BRAND",
  UnknownVariant: "UNKNOWN_VARIANT",
  UnknownBranch: "UNKNOWN_BRANCH",
  DuplicateCode: "DUPLICATE_CODE",
  InvalidVariantShape: "INVALID_VARIANT_SHAPE",
  InvalidQuantity: "INVALID_QUANTITY",
  InvalidReason: "INVALID_REASON",
  InsufficientStock: "INSUFFICIENT_STOCK",
  InsufficientCylinders: "INSUFFICIENT_CYLINDERS",
  BrandMismatch: "BRAND_MISMATCH",
  SizeMismatch: "SIZE_MISMATCH",
  SameBranchTransfer: "SAME_BRANCH_TRANSFER",
  UnsupportedStockModel: "UNSUPPORTED_STOCK_MODEL",
  InactiveBranch: "INACTIVE_BRANCH",
  InactiveVariant: "INACTIVE_VARIANT",
  NotAtomic: "NOT_ATOMIC",
  BalanceMismatch: "BALANCE_MISMATCH",
} as const;

export type StockErrorCode = (typeof StockErrorCode)[keyof typeof StockErrorCode];

export class StockError extends Error {
  readonly code: StockErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: StockErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class UnknownEntityError extends StockError {
  constructor(kind: "category" | "brand" | "variant" | "branch", id: string) {
    super(
      kind === "category"
        ? StockErrorCode.UnknownCategory
        : kind === "brand"
          ? StockErrorCode.UnknownBrand
          : kind === "variant"
            ? StockErrorCode.UnknownVariant
            : StockErrorCode.UnknownBranch,
      `Unknown ${kind}: ${id}`,
      { kind, id },
    );
  }
}

/** A variant was declared inconsistently with its category's stock model. */
export class InvalidVariantShapeError extends StockError {
  constructor(variantId: string, rule: string) {
    super(
      StockErrorCode.InvalidVariantShape,
      `Invalid variant ${variantId}: ${rule}`,
      { variantId, rule },
    );
  }
}

export class DuplicateCodeError extends StockError {
  constructor(kind: string, code: string) {
    super(StockErrorCode.DuplicateCode, `Duplicate ${kind} code: ${code}`, {
      kind,
      code,
    });
  }
}

export class InvalidQuantityError extends StockError {
  constructor(field: string, value: number, rule: string) {
    super(
      StockErrorCode.InvalidQuantity,
      `Invalid quantity for ${field}: ${value} (${rule})`,
      { field, value, rule },
    );
  }
}

export class InvalidReasonError extends StockError {
  constructor(reason: string | undefined) {
    super(
      StockErrorCode.InvalidReason,
      "A reason of at least 5 characters is required for this operation",
      { reason: reason ?? null },
    );
  }
}

export class InsufficientStockError extends StockError {
  constructor(
    branchId: string,
    variantId: string,
    state: string,
    requested: number,
    available: number,
  ) {
    super(
      StockErrorCode.InsufficientStock,
      `Not enough ${state} stock at branch ${branchId} for variant ${variantId}: ` +
        `requested ${requested}, available ${available}`,
      { branchId, variantId, state, requested, available },
    );
  }
}

export class InsufficientCylindersError extends StockError {
  constructor(
    branchId: string,
    variantId: string,
    custody: string,
    requested: number,
    available: number,
  ) {
    super(
      StockErrorCode.InsufficientCylinders,
      `Branch ${branchId} does not hold ${requested} company-owned ${variantId} ` +
        `cylinder(s) in ${custody} custody (available: ${available})`,
      { branchId, variantId, custody, requested, available },
    );
  }
}

export class BrandMismatchError extends StockError {
  constructor(outBrand: string, inBrand: string) {
    super(
      StockErrorCode.BrandMismatch,
      `Cannot exchange across brands: giving ${outBrand}, receiving ${inBrand}. ` +
        `Cylinder exchange schemes are per brand.`,
      { outBrand, inBrand },
    );
  }
}

export class SizeMismatchError extends StockError {
  constructor(outVariant: string, inVariant: string) {
    super(
      StockErrorCode.SizeMismatch,
      `Exchange is not like-for-like: ${outVariant} for ${inVariant}`,
      { outVariant, inVariant },
    );
  }
}

export class SameBranchTransferError extends StockError {
  constructor(branchId: string) {
    super(
      StockErrorCode.SameBranchTransfer,
      `Transfer source and destination are the same branch: ${branchId}`,
      { branchId },
    );
  }
}

export class UnsupportedStockModelError extends StockError {
  constructor(variantId: string, stockModel: string) {
    super(
      StockErrorCode.UnsupportedStockModel,
      `Variant ${variantId} uses the ${stockModel} stock model and has no ` +
        `REFILL/EMPTY lifecycle`,
      { variantId, stockModel },
    );
  }
}

export class InactiveBranchError extends StockError {
  constructor(branchId: string) {
    super(StockErrorCode.InactiveBranch, `Branch is closed: ${branchId}`, {
      branchId,
    });
  }
}

export class InactiveVariantError extends StockError {
  constructor(variantId: string) {
    super(StockErrorCode.InactiveVariant, `Variant is discontinued: ${variantId}`, {
      variantId,
    });
  }
}

/**
 * Thrown when a multi-line command fails part way through. Nothing was written:
 * the change set is discarded, never partially applied.
 */
export class NotAtomicError extends StockError {
  constructor(operation: string, cause: StockError) {
    super(
      StockErrorCode.NotAtomic,
      `${operation} rolled back: ${cause.message}`,
      { operation, cause: cause.code, causeDetails: cause.details },
    );
  }
}

/** A ledger/position reconciliation failure — indicates a bug, not user error. */
export class BalanceMismatchError extends StockError {
  constructor(key: string, fromLedger: number, fromPositions: number) {
    super(
      StockErrorCode.BalanceMismatch,
      `Ledger and positions disagree for ${key}: ledger says ${fromLedger}, ` +
        `positions say ${fromPositions}`,
      { key, fromLedger, fromPositions },
    );
  }
}
