import type { StockMovement } from "./types";
import { LedgerKind } from "./types";
import { custodyKey, gasKey } from "./stores";

export type MovementDraft = Omit<
  StockMovement,
  "id" | "seq" | "recordedAt"
>;

export interface MovementQuery {
  branchId?: string;
  variantId?: string;
  operation?: StockMovement["operation"];
  ledgerKind?: LedgerKind;
}

/**
 * Append-only audit trail for both ledgers.
 *
 * There is deliberately no update or delete method: a correction is a new
 * movement (a stocktake), never an edit of history. Balances can always be
 * rebuilt from scratch by replaying `all()` — `replayBalances()` exists to
 * prove it.
 */
export class MovementLedger {
  private readonly movements: StockMovement[] = [];
  private readonly keys = new Map<string, string[]>();
  private nextSeq = 1;

  append(draft: MovementDraft): StockMovement {
    const seq = this.nextSeq++;
    const movement: StockMovement = {
      ...draft,
      id: `MOV-${String(seq).padStart(6, "0")}`,
      seq,
      recordedAt: new Date().toISOString(),
    };
    this.movements.push(movement);

    if (movement.idempotencyKey) {
      const existing = this.keys.get(movement.idempotencyKey);
      if (existing) existing.push(movement.id);
      else this.keys.set(movement.idempotencyKey, [movement.id]);
    }
    return movement;
  }

  get size(): number {
    return this.movements.length;
  }

  all(): readonly StockMovement[] {
    return this.movements;
  }

  query(filter: MovementQuery = {}): StockMovement[] {
    return this.movements.filter(
      (m) =>
        (filter.branchId === undefined || m.branchId === filter.branchId) &&
        (filter.variantId === undefined || m.variantId === filter.variantId) &&
        (filter.operation === undefined || m.operation === filter.operation) &&
        (filter.ledgerKind === undefined || m.ledgerKind === filter.ledgerKind),
    );
  }

  hasIdempotencyKey(key: string): boolean {
    return this.keys.has(key);
  }

  movementIdsForKey(key: string): string[] {
    return [...(this.keys.get(key) ?? [])];
  }

  /** Sums every gas movement from zero. Must equal the live positions. */
  replayBalances(): Map<string, number> {
    const balances = new Map<string, number>();
    for (const m of this.movements) {
      if (m.ledgerKind !== LedgerKind.Gas || m.state === null) continue;
      const key = gasKey(m.branchId, m.variantId, m.state);
      balances.set(key, (balances.get(key) ?? 0) + m.quantity);
    }
    return balances;
  }

  /** Sums every cylinder movement from zero. Must equal the live custody. */
  replayCustodyBalances(): Map<string, number> {
    const balances = new Map<string, number>();
    for (const m of this.movements) {
      if (m.ledgerKind !== LedgerKind.Cylinder || m.custody === null) continue;
      const key = custodyKey(m.branchId, m.variantId, m.custody);
      balances.set(key, (balances.get(key) ?? 0) + m.quantity);
    }
    return balances;
  }
}
