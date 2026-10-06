import type { Database } from "./products";

type Row = Record<string, unknown>;

export class StockError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "StockError";
  }
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const strOrNull = (v: unknown): string | null =>
  v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim();
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

/**
 * A DATE column arrives as a string from postgres.js and as a Date from
 * PGlite. Formatting from the local parts keeps it on the right day — a DATE
 * has no time zone, so converting through UTC would shift it back a day for
 * anyone east of Greenwich.
 */
const dateOnly = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const month = String(v.getMonth() + 1).padStart(2, "0");
    const day = String(v.getDate()).padStart(2, "0");
    return `${v.getFullYear()}-${month}-${day}`;
  }
  return String(v).slice(0, 10);
};

const dateOrToday = (v?: string | null): string =>
  !v || !v.trim() ? new Date().toISOString().slice(0, 10) : v.trim().slice(0, 10);

export interface PurchaseInput {
  locationId: string;
  variantId: string;
  quantity: number | string;
  unitCostKsh: number | string;
  purchasedOn?: string | null;
  reference?: string | null;
  actor: string;
}

export interface FifoLine {
  lotId: number;
  purchasedOn: string;
  unitCostKsh: number;
  quantity: number;
}

export interface StockMovementRow {
  id: number;
  occurredAt: string;
  operation: string;
  channel: string;
  locationName: string;
  locationCode: string;
  counterpartyName: string | null;
  state: string | null;
  custody: string | null;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  unitCostKsh: number | null;
  reason: string;
  reference: string | null;
  actor: string;
}

export interface StockRow {
  variantId: string;
  variantName: string;
  variantCode: string;
  categoryId: string;
  categoryName: string;
  brandName: string;
  sizeKg: number | null;
  /** What the product usually sells for. */
  sellingPrice: number | null;
  /** The most recent buy price — the number worth knowing when setting a price. */
  lastCost: number | null;
  lastPurchasedOn: string | null;
  /** What the stock on the shelf actually cost, batch by batch. */
  costOnHand: number;
  refills: number;
  empties: number;
  total: number;
  /** What each branch holds, so the list can show a column per branch. */
  byLocation: { locationId: string; locationName: string; refills: number; empties: number }[];
}

/**
 * Stock in and out, against the database.
 *
 * Two rules the business asked for live here:
 *
 * 1. The stock list shows the **last purchase price**, because that is the
 *    number you set a selling price from.
 * 2. A sale consumes stock **oldest batch first**, so the cost attached to a
 *    sale is what those particular cylinders cost, not an average that hides a
 *    price rise.
 */
export class StockLedgerService {
  constructor(private readonly db: Database) {}

  // -------------------------------------------------------------- buying in

  /** Records a delivery from the depot: a batch at a price, on a branch. */
  async recordPurchase(input: PurchaseInput): Promise<{ lotId: number; balance: number }> {
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new StockError("BAD_QUANTITY", "A delivery has to be a whole number of cylinders.");
    }
    const unitCost = Number(input.unitCostKsh);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new StockError("BAD_COST", "A cost cannot be negative.");
    }
    const actor = (input.actor ?? "").trim();
    if (actor.length < 2) {
      throw new StockError("NO_ACTOR", "Say who received this delivery.");
    }

    const purchasedOn = dateOrToday(input.purchasedOn);
    const reference = strOrNull(input.reference);
    const now = new Date().toISOString();

    return this.db.transaction(async (tx) => {
      const before = await this.position(tx, input.locationId, input.variantId, "REFILL");

      const [lot] = await tx.query<Row>(
        `INSERT INTO stock_lots
           (location_id, variant_id, purchased_on, unit_cost_ksh, quantity, remaining, reference)
         VALUES ($1, $2, $3, $4, $5, $5, $6)
         RETURNING id`,
        [input.locationId, input.variantId, purchasedOn, unitCost, quantity, reference],
      );
      if (!lot) throw new StockError("NOT_FOUND", "That product or branch does not exist.");

      await this.bump(tx, input.locationId, input.variantId, "REFILL", quantity);
      // A full cylinder bought in is also a company shell sitting at the branch.
      await this.bumpCustody(tx, input.locationId, input.variantId, "BRANCH", quantity);

      await this.writeMovement(tx, {
        ledgerKind: "GAS",
        operation: "PURCHASE",
        occurredAt: now,
        locationId: input.locationId,
        variantId: input.variantId,
        state: "REFILL",
        quantity,
        balanceBefore: before,
        reason: `Received ${quantity} from the depot`,
        reference,
        actor,
        unitCostKsh: unitCost,
      });
      await this.writeMovement(tx, {
        ledgerKind: "CYLINDER",
        operation: "PURCHASE",
        occurredAt: now,
        locationId: input.locationId,
        variantId: input.variantId,
        custody: "BRANCH",
        quantity,
        balanceBefore: before,
        reason: `Received ${quantity} from the depot`,
        reference,
        actor,
        unitCostKsh: unitCost,
      });

      return { lotId: num(lot.id), balance: before + quantity };
    });
  }

  /**
   * Takes cylinders out of stock oldest batch first, and says what they cost.
   *
   * This is what a sale calls, so the margin on a sale is the margin on the
   * cylinders that actually left the branch.
   */
  async consumeFifo(args: {
    locationId: string;
    variantId: string;
    quantity: number;
  }): Promise<{ lines: FifoLine[]; totalCostKsh: number }> {
    if (args.quantity <= 0) return { lines: [], totalCostKsh: 0 };

    const lots = await this.db.query<Row>(
      `SELECT id, purchased_on, unit_cost_ksh, remaining
         FROM stock_lots
        WHERE location_id = $1 AND variant_id = $2 AND remaining > 0
        ORDER BY purchased_on, id`,
      [args.locationId, args.variantId],
    );

    const lines: FifoLine[] = [];
    let left = args.quantity;
    let total = 0;
    for (const lot of lots) {
      if (left <= 0) break;
      const take = Math.min(left, num(lot.remaining));
      const unit = num(lot.unit_cost_ksh);
      lines.push({
        lotId: num(lot.id),
        purchasedOn: dateOnly(lot.purchased_on),
        unitCostKsh: unit,
        quantity: take,
      });
      total += take * unit;
      left -= take;
      await this.db.query("UPDATE stock_lots SET remaining = remaining - $1 WHERE id = $2", [
        take,
        num(lot.id),
      ]);
    }

    if (left > 0) {
      throw new StockError(
        "NOT_ENOUGH_STOCK",
        `Only ${args.quantity - left} of ${args.quantity} are costed at this branch — record the delivery first.`,
      );
    }
    return { lines, totalCostKsh: total };
  }

  // ---------------------------------------------------------------- reading

  /**
   * The stock list: one row per product, optionally for a single branch, with
   * the last buy price and the cost of what is actually on the shelf.
   */
  async stockRows(options: { locationId?: string | null } = {}): Promise<StockRow[]> {
    const params: unknown[] = [];
    let filter = "";
    if (options.locationId) {
      params.push(options.locationId);
      filter = "AND p.location_id = $1";
    }

    const rows = await this.db.query<Row>(
      `SELECT v.id, v.name, v.code, v.size_kg, v.list_price_ksh,
              c.id AS category_id, c.name AS category_name, b.name AS brand_name,
              coalesce(sum(p.quantity) FILTER (WHERE p.state = 'REFILL'), 0) AS refills,
              coalesce(sum(p.quantity) FILTER (WHERE p.state = 'EMPTY'), 0)  AS empties,
              coalesce(sum(p.quantity), 0)                                   AS total
         FROM product_variants v
         JOIN categories c ON c.id = v.category_id
         JOIN brands b ON b.id = v.brand_id
         LEFT JOIN inventory_positions p ON p.variant_id = v.id ${filter}
        GROUP BY v.id, c.id, b.id
        ORDER BY c.name, v.size_kg NULLS LAST, b.name`,
      params,
    );

    const costParams: unknown[] = [];
    let costFilter = "";
    if (options.locationId) {
      costParams.push(options.locationId);
      costFilter = "WHERE location_id = $1";
    }
    const positionRows = await this.db.query<Row>(
      `SELECT p.variant_id, p.state, p.quantity, l.id AS location_id, l.name AS location_name
         FROM inventory_positions p
         JOIN stock_locations l ON l.id = p.location_id
        WHERE p.quantity > 0
        ORDER BY l.name`,
    );

    const costs = await this.db.query<Row>(
      `SELECT variant_id,
              sum(cost_on_hand_ksh) AS cost_on_hand,
              max(last_purchase_ksh) AS last_cost,
              max(last_purchased_on) AS last_on
         FROM v_stock_cost ${costFilter}
        GROUP BY variant_id`,
      costParams,
    );

    return rows.map((row) => {
      const cost = costs.find((c) => str(c.variant_id) === str(row.id));
      const refills = num(row.refills);
      const empties = num(row.empties);
      const byLocation: StockRow["byLocation"] = [];
      for (const p of positionRows.filter((x) => str(x.variant_id) === str(row.id))) {
        const locationId = str(p.location_id);
        let at = byLocation.find((b) => b.locationId === locationId);
        if (!at) {
          at = { locationId, locationName: str(p.location_name), refills: 0, empties: 0 };
          byLocation.push(at);
        }
        if (str(p.state) === "REFILL") at.refills += num(p.quantity);
        else at.empties += num(p.quantity);
      }
      return {
        variantId: str(row.id),
        variantName: str(row.name),
        variantCode: str(row.code),
        categoryId: str(row.category_id),
        categoryName: str(row.category_name),
        brandName: str(row.brand_name),
        sizeKg: numOrNull(row.size_kg),
        sellingPrice: numOrNull(row.list_price_ksh),
        lastCost: cost ? numOrNull(cost.last_cost) : null,
        lastPurchasedOn: cost && cost.last_on ? dateOnly(cost.last_on) : null,
        costOnHand: cost ? num(cost.cost_on_hand) : 0,
        refills,
        empties,
        total: refills + empties,
        byLocation,
      };
    });
  }

  /** The movement history for one product, newest first. */
  async movements(
    variantId: string,
    options: { locationId?: string | null; limit?: number } = {},
  ): Promise<StockMovementRow[]> {
    const params: unknown[] = [variantId];
    let filter = "";
    if (options.locationId) {
      params.push(options.locationId);
      filter += ` AND (m.location_id = $${params.length} OR m.counterparty_location_id = $${params.length})`;
    }
    params.push(options.limit ?? 200);

    const rows = await this.db.query<Row>(
      `SELECT m.*, l.name AS location_name, l.code AS location_code,
              o.name AS counterparty_name
         FROM stock_movements m
         JOIN stock_locations l ON l.id = m.location_id
         LEFT JOIN stock_locations o ON o.id = m.counterparty_location_id
        WHERE m.variant_id = $1 ${filter}
        ORDER BY m.occurred_at DESC, m.id DESC
        LIMIT $${params.length}`,
      params,
    );

    return rows.map((row) => ({
      id: num(row.id),
      occurredAt: str(row.occurred_at),
      operation: str(row.operation),
      channel: str(row.channel),
      locationName: str(row.location_name),
      locationCode: str(row.location_code),
      counterpartyName: strOrNull(row.counterparty_name),
      state: strOrNull(row.state),
      custody: strOrNull(row.custody),
      quantity: num(row.quantity),
      balanceBefore: num(row.balance_before),
      balanceAfter: num(row.balance_after),
      unitCostKsh: numOrNull(row.unit_cost_ksh),
      reason: str(row.reason),
      reference: strOrNull(row.reference),
      actor: str(row.actor),
    }));
  }

  /** What is left of each batch — the FIFO queue for one product at a branch. */
  async lots(
    variantId: string,
    options: { locationId?: string | null } = {},
  ): Promise<(FifoLine & { remaining: number; locationName: string })[]> {
    const params: unknown[] = [variantId];
    let filter = "";
    if (options.locationId) {
      params.push(options.locationId);
      filter = `AND l.location_id = $${params.length}`;
    }
    const rows = await this.db.query<Row>(
      `SELECT l.id, l.purchased_on, l.unit_cost_ksh, l.remaining, lo.name AS location_name
         FROM stock_lots l
         JOIN stock_locations lo ON lo.id = l.location_id
        WHERE l.variant_id = $1 ${filter} AND l.remaining > 0
        ORDER BY lo.name, l.purchased_on, l.id`,
      params,
    );
    return rows.map((row) => ({
      lotId: num(row.id),
      purchasedOn: dateOnly(row.purchased_on),
      unitCostKsh: num(row.unit_cost_ksh),
      quantity: num(row.remaining),
      remaining: num(row.remaining),
      locationName: str(row.location_name),
    }));
  }

  async product(variantId: string) {
    const rows = await this.db.query<Row>(
      `SELECT v.*, c.name AS category_name, c.stock_model, b.name AS brand_name
         FROM product_variants v
         JOIN categories c ON c.id = v.category_id
         JOIN brands b ON b.id = v.brand_id
        WHERE v.id = $1`,
      [variantId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: str(row.id),
      code: str(row.code),
      name: str(row.name),
      categoryName: str(row.category_name),
      stockModel: str(row.stock_model),
      brandName: str(row.brand_name),
      sizeKg: numOrNull(row.size_kg),
      sellingPrice: numOrNull(row.list_price_ksh),
    };
  }

  // --------------------------------------------------------------- internals

  private async position(
    db: Database,
    locationId: string,
    variantId: string,
    state: string,
  ): Promise<number> {
    const rows = await db.query<Row>(
      "SELECT quantity FROM inventory_positions WHERE location_id = $1 AND variant_id = $2 AND state = $3",
      [locationId, variantId, state],
    );
    return rows.length === 0 ? 0 : num(rows[0].quantity);
  }

  private async bump(
    db: Database,
    locationId: string,
    variantId: string,
    state: string,
    delta: number,
  ): Promise<void> {
    await db.query(
      `INSERT INTO inventory_positions (location_id, variant_id, state, quantity, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (location_id, variant_id, state)
       DO UPDATE SET quantity = inventory_positions.quantity + $4, updated_at = now()`,
      [locationId, variantId, state, delta],
    );
  }

  private async bumpCustody(
    db: Database,
    locationId: string,
    variantId: string,
    custody: string,
    delta: number,
  ): Promise<void> {
    await db.query(
      `INSERT INTO cylinder_custody (location_id, variant_id, custody, quantity, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (location_id, variant_id, custody)
       DO UPDATE SET quantity = cylinder_custody.quantity + $4, updated_at = now()`,
      [locationId, variantId, custody, delta],
    );
  }

  private async writeMovement(
    db: Database,
    m: {
      ledgerKind: string;
      operation: string;
      occurredAt: string;
      locationId: string;
      variantId: string;
      state?: string;
      custody?: string;
      quantity: number;
      balanceBefore: number;
      reason: string;
      reference: string | null;
      actor: string;
      unitCostKsh: number | null;
      counterpartyLocationId?: string | null;
    },
  ): Promise<void> {
    await db.query(
      `INSERT INTO stock_movements
         (ledger_kind, operation, occurred_at, location_id, counterparty_location_id,
          variant_id, state, custody, quantity, balance_before, balance_after,
          reason, reference, actor, unit_cost_ksh)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        m.ledgerKind,
        m.operation,
        m.occurredAt,
        m.locationId,
        m.counterpartyLocationId ?? null,
        m.variantId,
        m.state ?? null,
        m.custody ?? null,
        m.quantity,
        m.balanceBefore,
        m.balanceBefore + m.quantity,
        m.reason,
        m.reference,
        m.actor,
        m.unitCostKsh,
      ],
    );
  }
}
