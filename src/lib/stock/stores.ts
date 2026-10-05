import type { Custody, GasState } from "./types";
import { InsufficientCylindersError, InsufficientStockError } from "./errors";

const SEPARATOR = "|";

function assertSafeId(part: string, label: string): void {
  if (part.includes(SEPARATOR)) {
    throw new Error(`Unsafe ${label} identifier (must not contain "|"): ${part}`);
  }
}

export function gasKey(branchId: string, variantId: string, state: GasState): string {
  assertSafeId(branchId, "branch");
  assertSafeId(variantId, "variant");
  return [branchId, variantId, state].join(SEPARATOR);
}

export function custodyKey(
  branchId: string,
  variantId: string,
  custody: Custody,
): string {
  assertSafeId(branchId, "branch");
  assertSafeId(variantId, "variant");
  return [branchId, variantId, custody].join(SEPARATOR);
}

/**
 * Gas stock ledger #1: how much saleable product sits at each branch.
 *
 * Positions never go negative. Callers validate against projected balances
 * before committing, so hitting the guard here means a bug upstream.
 */
export class GasInventoryStore {
  private readonly balances = new Map<string, number>();

  balance(branchId: string, variantId: string, state: GasState): number {
    return this.balances.get(gasKey(branchId, variantId, state)) ?? 0;
  }

  /**
   * Applies a signed delta and reports the balances either side of it, which is
   * exactly what the audit ledger needs.
   */
  add(
    branchId: string,
    variantId: string,
    state: GasState,
    delta: number,
  ): { before: number; after: number } {
    const key = gasKey(branchId, variantId, state);
    const before = this.balances.get(key) ?? 0;
    const after = before + delta;
    if (after < 0) {
      throw new InsufficientStockError(branchId, variantId, state, -delta, before);
    }
    if (after === 0) this.balances.delete(key);
    else this.balances.set(key, after);
    return { before, after };
  }

  /** Every non-zero position. Used by reconciliation and the dashboard. */
  entries(): Array<{
    branchId: string;
    variantId: string;
    state: GasState;
    quantity: number;
  }> {
    return [...this.balances.entries()].map(([key, quantity]) => {
      const [branchId, variantId, state] = key.split(SEPARATOR);
      return {
        branchId,
        variantId,
        state: state as GasState,
        quantity,
      };
    });
  }
}

/**
 * Cylinder custody ledger #2: where the company's own shells are.
 *
 * Independent of gas stock on purpose — a branch can hold 40 filled Afri Gas
 * cylinders in shells that all belong to the brand's exchange pool, or own 20
 * shells that are all empty.
 */
export class CylinderCustodyStore {
  private readonly balances = new Map<string, number>();

  balance(branchId: string, variantId: string, custody: Custody): number {
    return this.balances.get(custodyKey(branchId, variantId, custody)) ?? 0;
  }

  add(
    branchId: string,
    variantId: string,
    custody: Custody,
    delta: number,
  ): { before: number; after: number } {
    const key = custodyKey(branchId, variantId, custody);
    const before = this.balances.get(key) ?? 0;
    const after = before + delta;
    if (after < 0) {
      throw new InsufficientCylindersError(
        branchId,
        variantId,
        custody,
        -delta,
        before,
      );
    }
    if (after === 0) this.balances.delete(key);
    else this.balances.set(key, after);
    return { before, after };
  }

  entries(): Array<{
    branchId: string;
    variantId: string;
    custody: Custody;
    quantity: number;
  }> {
    return [...this.balances.entries()].map(([key, quantity]) => {
      const [branchId, variantId, custody] = key.split(SEPARATOR);
      return {
        branchId,
        variantId,
        custody: custody as Custody,
        quantity,
      };
    });
  }
}
