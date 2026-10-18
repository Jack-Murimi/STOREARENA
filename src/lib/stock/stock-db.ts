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

const wholeCount = (value: number | string | null | undefined, label: string): number => {
  if (value === null || value === undefined || String(value).trim() === "") return 0;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new StockError("BAD_OPENING_COUNT", `${label} must be a whole number of zero or more.`);
  }
  return count;
};

export interface PurchaseInput {
  locationId: string;
  variantId: string;
  quantity: number | string;
  unitCostKsh: number | string;
  purchasedOn?: string | null;
  reference?: string | null;
  /** Stable per browser submission; makes a retry safe. */
  idempotencyKey?: string | null;
  actor: string;
}

/** One product at one branch on the initial count sheet. */
export interface OpeningStockEntry {
  locationId: string;
  variantId: string;
  refills: number | string | null;
  empties: number | string | null;
  /** Required when a row has filled stock; empty-only rows carry no gas cost. */
  unitCostKsh: number | string | null;
}

export interface OpeningStockInput {
  entries: OpeningStockEntry[];
  actor: string;
  reference?: string | null;
  occurredOn?: string | null;
}

export interface OpeningStockResult {
  entries: number;
  refills: number;
  empties: number;
  lots: number;
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
  stockModel: "CYLINDER" | "SIMPLE";
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
    const idempotencyKey = strOrNull(input.idempotencyKey);
    const now = new Date().toISOString();

    return this.db.transaction(async (tx) => {
      if (idempotencyKey) {
        const replay = await tx.query<Row>(
          `SELECT balance_after
             FROM stock_movements
            WHERE idempotency_key = $1
              AND location_id = $2
              AND variant_id = $3
              AND ledger_kind = 'GAS'
              AND operation = 'PURCHASE'
              AND state = 'REFILL'
            LIMIT 1`,
          [idempotencyKey, input.locationId, input.variantId],
        );
        if (replay.length > 0) {
          return { lotId: 0, balance: num(replay[0].balance_after) };
        }
      }

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
        idempotencyKey,
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
        idempotencyKey,
      });

      return { lotId: num(lot.id), balance: before + quantity };
    });
  }

  /**
   * Sets the first counted stock for the business in one transaction.
   *
   * Filled stock becomes a FIFO lot at its opening unit cost. Empty cylinders
   * have no gas cost, but do receive an EMPTY balance and branch custody. This
   * command is deliberately unavailable after any stock movement exists: later
   * corrections must use normal operational stock movements instead.
   */
  async recordOpeningStock(input: OpeningStockInput): Promise<OpeningStockResult> {
    const actor = (input.actor ?? "").trim();
    if (actor.length < 2) throw new StockError("NO_ACTOR", "A signed-in staff member is required.");
    if (!Array.isArray(input.entries)) {
      throw new StockError("BAD_OPENING_STOCK", "Enter at least one opening stock value.");
    }

    const entries = input.entries
      .map((entry) => {
        const refills = wholeCount(entry.refills, "Refill count");
        const empties = wholeCount(entry.empties, "Empty count");
        const rawCost = entry.unitCostKsh;
        let unitCost: number | null = null;
        if (refills > 0) {
          if (rawCost === null || rawCost === undefined || String(rawCost).trim() === "") {
            throw new StockError("OPENING_COST_REQUIRED", "Enter a unit cost for every opening refill count.");
          }
          unitCost = Number(rawCost);
          if (!Number.isFinite(unitCost) || unitCost < 0) {
            throw new StockError("BAD_COST", "An opening unit cost cannot be negative.");
          }
        }
        return {
          locationId: str(entry.locationId).trim(),
          variantId: str(entry.variantId).trim(),
          refills,
          empties,
          unitCost,
        };
      })
      .filter((entry) => entry.refills > 0 || entry.empties > 0);

    if (entries.length === 0) {
      throw new StockError("EMPTY_OPENING_STOCK", "Enter at least one refill or empty count before saving.");
    }

    const seen = new Set<string>();
    for (const entry of entries) {
      if (!entry.locationId || !entry.variantId) {
        throw new StockError("BAD_OPENING_STOCK", "Each opening-stock value needs a branch and product.");
      }
      const key = `${entry.locationId}:${entry.variantId}`;
      if (seen.has(key)) {
        throw new StockError("DUPLICATE_OPENING_STOCK", "A product can only have one opening entry per branch.");
      }
      seen.add(key);
    }

    const occurredAt = `${dateOrToday(input.occurredOn)}T00:00:00.000Z`;
    const reference = strOrNull(input.reference) ?? "OPENING-STOCK";

    return this.db.transaction(async (tx) => {
      const movementExists = await tx.query<Row>("SELECT 1 FROM stock_movements LIMIT 1");
      if (movementExists.length > 0) {
        throw new StockError(
          "OPENING_STOCK_CLOSED",
          "Opening stock can only be set before the first stock movement. Use a stocktake for later corrections.",
        );
      }

      let totalRefills = 0;
      let totalEmpties = 0;
      let lots = 0;

      for (const entry of entries) {
        const variant = await tx.query<Row>(
          `SELECT c.stock_model
             FROM product_variants v
             JOIN categories c ON c.id = v.category_id
            WHERE v.id = $1`,
          [entry.variantId],
        );
        const location = await tx.query<Row>(
          "SELECT 1 FROM stock_locations WHERE id = $1 AND active",
          [entry.locationId],
        );
        if (variant.length === 0 || location.length === 0) {
          throw new StockError("NOT_FOUND", "One of the selected products or active branches no longer exists.");
        }
        const isCylinder = str(variant[0].stock_model) === "CYLINDER";
        if (!isCylinder && entry.empties > 0) {
          throw new StockError("EMPTY_SIMPLE_ITEM", "Only cylinder products can have an opening empty count.");
        }

        if (entry.refills > 0) {
          const before = await this.position(tx, entry.locationId, entry.variantId, "REFILL");
          const [lot] = await tx.query<Row>(
            `INSERT INTO stock_lots
               (location_id, variant_id, purchased_on, unit_cost_ksh, quantity, remaining, reference)
             VALUES ($1, $2, $3, $4, $5, $5, $6)
             RETURNING id`,
            [
              entry.locationId,
              entry.variantId,
              dateOrToday(input.occurredOn),
              entry.unitCost,
              entry.refills,
              reference,
            ],
          );
          if (!lot) throw new StockError("NOT_FOUND", "That product or branch does not exist.");
          lots += 1;
          await this.bump(tx, entry.locationId, entry.variantId, "REFILL", entry.refills);
          await this.writeMovement(tx, {
            ledgerKind: "GAS",
            operation: "STOCKTAKE",
            occurredAt,
            locationId: entry.locationId,
            variantId: entry.variantId,
            state: "REFILL",
            quantity: entry.refills,
            balanceBefore: before,
            reason: "Opening stock — refill count",
            reference,
            actor,
            unitCostKsh: entry.unitCost,
          });
          totalRefills += entry.refills;
        }

        if (entry.empties > 0) {
          const before = await this.position(tx, entry.locationId, entry.variantId, "EMPTY");
          await this.bump(tx, entry.locationId, entry.variantId, "EMPTY", entry.empties);
          await this.writeMovement(tx, {
            ledgerKind: "GAS",
            operation: "STOCKTAKE",
            occurredAt,
            locationId: entry.locationId,
            variantId: entry.variantId,
            state: "EMPTY",
            quantity: entry.empties,
            balanceBefore: before,
            reason: "Opening stock — empty count",
            reference,
            actor,
            unitCostKsh: null,
          });
          totalEmpties += entry.empties;
        }

        if (isCylinder) {
          const cylinders = entry.refills + entry.empties;
          const before = await this.custodyPosition(tx, entry.locationId, entry.variantId, "BRANCH");
          await this.bumpCustody(tx, entry.locationId, entry.variantId, "BRANCH", cylinders);
          await this.writeMovement(tx, {
            ledgerKind: "CYLINDER",
            operation: "STOCKTAKE",
            occurredAt,
            locationId: entry.locationId,
            variantId: entry.variantId,
            custody: "BRANCH",
            quantity: cylinders,
            balanceBefore: before,
            reason: "Opening stock — branch custody",
            reference,
            actor,
            unitCostKsh: null,
          });
        }
      }

      return { entries: entries.length, refills: totalRefills, empties: totalEmpties, lots };
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
              c.id AS category_id, c.name AS category_name, c.stock_model, b.name AS brand_name,
              coalesce(sum(p.quantity) FILTER (WHERE p.state = 'REFILL'), 0) AS refills,
              coalesce(sum(p.quantity) FILTER (WHERE p.state = 'EMPTY'), 0)  AS empties,
              coalesce(sum(p.quantity), 0)                                   AS total
         FROM product_variants v
         JOIN categories c ON c.id = v.category_id
         JOIN brands b ON b.id = v.brand_id
         LEFT JOIN inventory_positions p ON p.variant_id = v.id ${filter}
        GROUP BY v.id, c.id, b.id
        ORDER BY v.size_kg NULLS LAST, b.name, c.name`,
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
        stockModel: str(row.stock_model) as "CYLINDER" | "SIMPLE",
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

  private async custodyPosition(
    db: Database,
    locationId: string,
    variantId: string,
    custody: string,
  ): Promise<number> {
    const rows = await db.query<Row>(
      "SELECT quantity FROM cylinder_custody WHERE location_id = $1 AND variant_id = $2 AND custody = $3",
      [locationId, variantId, custody],
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
      idempotencyKey?: string | null;
      counterpartyLocationId?: string | null;
    },
  ): Promise<void> {
    await db.query(
      `INSERT INTO stock_movements
         (ledger_kind, operation, occurred_at, location_id, counterparty_location_id,
          variant_id, state, custody, quantity, balance_before, balance_after,
          reason, reference, actor, unit_cost_ksh, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
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
        m.idempotencyKey ?? null,
      ],
    );
  }
}
