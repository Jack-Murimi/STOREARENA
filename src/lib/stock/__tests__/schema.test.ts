import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The schema is executed against a real PostgreSQL engine (PGlite runs the
 * actual server compiled to WebAssembly), so these tests prove the DDL, the
 * constraints and the triggers behave — they are not a mock of them.
 */
const DDL = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

let db: PGlite;

/** Runs a statement that is expected to fail and returns the server's message. */
async function expectFailure(sql: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(sql, params);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("Expected the statement to fail, but it succeeded");
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(DDL);
  await db.exec(`
    INSERT INTO categories (id, code, name, stock_model) VALUES
      ('cat-lpg-cylinder', 'LPG-CYL', 'LPG Cylinders', 'CYLINDER'),
      ('cat-accessory',    'ACC',     'Accessories',   'SIMPLE');

    INSERT INTO brands (id, code, name, depot_name) VALUES
      ('brand-afrigas', 'AFRIGAS', 'Afri Gas',       'Afri Gas Nairobi Depot'),
      ('brand-total',   'TOTAL',   'TotalEnergies',  'TotalEnergies Kipevu Depot'),
      ('brand-rubis',   'RUBIS',   'Rubis',          'Rubis Energy Depot');

    INSERT INTO stock_locations (id, code, name, kind) VALUES
      ('loc-syokimau',   'SYK', 'Gateway Gas — Syokimau', 'BRANCH'),
      ('loc-mlolongo',   'MLO', 'Gateway Gas — Mlolongo', 'BRANCH'),
      ('loc-athi-river', 'ATR', 'Gateway Gas — Athi River', 'BRANCH');

    INSERT INTO stock_locations (id, code, name, kind, home_location_id, rider) VALUES
      ('van-01', 'VAN-01', 'Rider van — Brian O.', 'VAN', 'loc-syokimau', 'Brian O.');

    INSERT INTO product_variants
      (id, code, category_id, brand_id, name, size_kg, list_price_ksh)
    VALUES
      ('var-afrigas-13', 'AFRIGAS-13', 'cat-lpg-cylinder', 'brand-afrigas', 'Afri Gas 13 kg',      13, 2350),
      ('var-total-13',   'TOTAL-13',   'cat-lpg-cylinder', 'brand-total',   'TotalEnergies 13 kg', 13, 2400);

    INSERT INTO product_variants
      (id, code, category_id, brand_id, name, list_price_ksh)
    VALUES
      ('var-acc-regulator', 'ACC-REG', 'cat-accessory', 'brand-total', 'Low-pressure regulator', 1200);
  `);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("schema shape", () => {
  it("creates the two ledgers, the audit table and the sales tables", async () => {
    const { rows } = await db.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name
    `);
    expect(rows.map((r) => r.table_name)).toEqual([
      "brands",
      "categories",
      "cylinder_custody",
      "inventory_positions",
      "product_variants",
      "sale_lines",
      "sales",
      "stock_locations",
      "stock_lots",
      "stock_movements",
    ]);
  });

  it("exposes the reporting views", async () => {
    const { rows } = await db.query<{ viewname: string }>(`
      SELECT viewname FROM pg_views WHERE schemaname = 'public' ORDER BY viewname
    `);
    expect(rows.map((r) => r.viewname)).toEqual([
      "v_cylinder_counts",
      "v_inventory_value",
      "v_stock_cost",
    ]);
  });

  it("holds no deposit column anywhere, because the business holds none", async () => {
    const { rows } = await db.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name LIKE '%deposit%'
    `);
    expect(rows).toEqual([]);
  });
});

describe("locations", () => {
  it("refuses a van with no branch to belong to", async () => {
    const message = await expectFailure(`
      INSERT INTO stock_locations (id, code, name, kind, rider)
      VALUES ('van-99', 'VAN-99', 'Orphan van', 'VAN', 'Nobody')
    `);
    expect(message).toMatch(/van_needs_branch_and_rider/);
  });

  it("refuses a van with no rider responsible for it", async () => {
    const message = await expectFailure(`
      INSERT INTO stock_locations (id, code, name, kind, home_location_id)
      VALUES ('van-98', 'VAN-98', 'Driverless van', 'VAN', 'loc-syokimau')
    `);
    expect(message).toMatch(/van_needs_branch_and_rider/);
  });

  it("refuses to give a branch a home branch", async () => {
    const message = await expectFailure(`
      INSERT INTO stock_locations (id, code, name, kind, home_location_id)
      VALUES ('loc-odd', 'ODD', 'Nested branch', 'BRANCH', 'loc-syokimau')
    `);
    expect(message).toMatch(/branch_has_no_home/);
  });
});

describe("gas stock constraints", () => {
  it("refuses a negative position quantity", async () => {
    const message = await expectFailure(`
      INSERT INTO inventory_positions (location_id, variant_id, state, quantity)
      VALUES ('loc-syokimau', 'var-afrigas-13', 'REFILL', -1)
    `);
    expect(message).toMatch(/inventory_positions_quantity_check/);
  });

  it("refuses an unknown gas state", async () => {
    const message = await expectFailure(`
      INSERT INTO inventory_positions (location_id, variant_id, state, quantity)
      VALUES ('loc-syokimau', 'var-afrigas-13', 'HALF_FULL', 1)
    `);
    expect(message).toMatch(/state/);
  });

  it("holds one row per location, variant and state", async () => {
    await db.exec(`
      INSERT INTO inventory_positions (location_id, variant_id, state, quantity)
      VALUES ('loc-syokimau', 'var-afrigas-13', 'REFILL', 23)
    `);
    const message = await expectFailure(`
      INSERT INTO inventory_positions (location_id, variant_id, state, quantity)
      VALUES ('loc-syokimau', 'var-afrigas-13', 'REFILL', 5)
    `);
    expect(message).toMatch(/duplicate key/i);
  });
});

describe("cylinder custody constraints", () => {
  it("refuses a negative cylinder count", async () => {
    const message = await expectFailure(`
      INSERT INTO cylinder_custody (location_id, variant_id, custody, quantity)
      VALUES ('loc-syokimau', 'var-afrigas-13', 'BRANCH', -2)
    `);
    expect(message).toMatch(/cylinder_custody_quantity_check/);
  });

  it("refuses an unknown custody location", async () => {
    const message = await expectFailure(`
      INSERT INTO cylinder_custody (location_id, variant_id, custody, quantity)
      VALUES ('loc-syokimau', 'var-afrigas-13', 'LOST', 1)
    `);
    expect(message).toMatch(/custody/);
  });
});

describe("audit ledger is append-only", () => {
  it("accepts an insert", async () => {
    await db.exec(`
      INSERT INTO stock_movements
        (ledger_kind, operation, occurred_at, location_id, variant_id, state,
         quantity, balance_before, balance_after, reason, actor, reference)
      VALUES
        ('GAS', 'PURCHASE', now(), 'loc-syokimau', 'var-afrigas-13', 'REFILL',
         23, 0, 23, 'Opening balance', 'seed', 'SEED-OPEN')
    `);
    const { rows } = await db.query<{ id: number }>(
      "SELECT id FROM stock_movements ORDER BY id DESC LIMIT 1",
    );
    expect(rows[0].id).toBeGreaterThan(0);
  });

  it("refuses to update history", async () => {
    const message = await expectFailure(
      "UPDATE stock_movements SET quantity = 999 WHERE id = 1",
    );
    expect(message).toMatch(/append-only/);
  });

  it("refuses to delete history", async () => {
    const message = await expectFailure("DELETE FROM stock_movements WHERE id = 1");
    expect(message).toMatch(/append-only/);
  });

  it("refuses a row whose balances do not add up", async () => {
    const message = await expectFailure(`
      INSERT INTO stock_movements
        (ledger_kind, operation, occurred_at, location_id, variant_id, state,
         quantity, balance_before, balance_after, reason, actor)
      VALUES
        ('GAS', 'REFILL_SALE', now(), 'loc-syokimau', 'var-afrigas-13', 'REFILL',
         -3, 23, 25, 'Counter sale', 'Joyce W.')
    `);
    expect(message).toMatch(/movement_balance_consistent/);
  });

  it("refuses a reason too short to be useful", async () => {
    const message = await expectFailure(`
      INSERT INTO stock_movements
        (ledger_kind, operation, occurred_at, location_id, variant_id, state,
         quantity, balance_before, balance_after, reason, actor)
      VALUES
        ('GAS', 'STOCKTAKE', now(), 'loc-syokimau', 'var-afrigas-13', 'REFILL',
         0, 23, 23, 'n/a', 'Brian O.')
    `);
    expect(message).toMatch(/reason/);
  });

  it("refuses an actor too short to identify anybody", async () => {
    const message = await expectFailure(`
      INSERT INTO stock_movements
        (ledger_kind, operation, occurred_at, location_id, variant_id, state,
         quantity, balance_before, balance_after, reason, actor)
      VALUES
        ('GAS', 'REFILL_SALE', now(), 'loc-syokimau', 'var-afrigas-13', 'REFILL',
         -1, 23, 22, 'Counter sale', 'J')
    `);
    expect(message).toMatch(/actor/);
  });

  it("refuses a gas row that claims a custody, and vice versa", async () => {
    const message = await expectFailure(`
      INSERT INTO stock_movements
        (ledger_kind, operation, occurred_at, location_id, variant_id, state, custody,
         quantity, balance_before, balance_after, reason, actor)
      VALUES
        ('GAS', 'PURCHASE', now(), 'loc-syokimau', 'var-afrigas-13', 'REFILL', 'BRANCH',
         1, 23, 24, 'Impossible row', 'seed')
    `);
    expect(message).toMatch(/movement_ledger_shape/);
  });

  it("refuses a transfer recorded against itself", async () => {
    const message = await expectFailure(`
      INSERT INTO stock_movements
        (ledger_kind, operation, occurred_at, location_id, counterparty_location_id,
         variant_id, state, quantity, balance_before, balance_after, reason, actor)
      VALUES
        ('GAS', 'TRANSFER', now(), 'loc-syokimau', 'loc-syokimau',
         'var-afrigas-13', 'REFILL', 1, 23, 24, 'Self transfer', 'seed')
    `);
    expect(message).toMatch(/movement_no_self_counterparty/);
  });

  it("records the channel a movement happened on", async () => {
    await db.exec(`
      INSERT INTO stock_movements
        (ledger_kind, operation, channel, occurred_at, location_id, variant_id, state,
         quantity, balance_before, balance_after, reason, actor)
      VALUES
        ('GAS', 'EXCHANGE', 'DELIVERY', now(), 'van-01', 'var-afrigas-13', 'REFILL',
         -1, 12, 11, 'Sold at the door', 'Brian O.')
    `);
    const { rows } = await db.query<{ channel: string }>(
      "SELECT channel FROM stock_movements WHERE channel = 'DELIVERY'",
    );
    expect(rows).toHaveLength(1);
  });
});

describe("idempotency at the database level", () => {
  it("allows several rows for one command, but not the same row twice", async () => {
    const key = "MPESA-OPK7Q2X9L4";

    // A purchase writes a gas row and a custody row under one key: allowed.
    await db.query(
      `INSERT INTO stock_movements
         (ledger_kind, operation, occurred_at, location_id, variant_id, state,
          quantity, balance_before, balance_after, reason, actor, idempotency_key)
       VALUES ('GAS', 'PURCHASE', now(), 'loc-mlolongo', 'var-total-13', 'REFILL',
               8, 0, 8, 'Depot delivery', 'Joyce W.', $1)`,
      [key],
    );
    await db.query(
      `INSERT INTO stock_movements
         (ledger_kind, operation, occurred_at, location_id, variant_id, custody,
          quantity, balance_before, balance_after, reason, actor, idempotency_key)
       VALUES ('CYLINDER', 'PURCHASE', now(), 'loc-mlolongo', 'var-total-13', 'BRANCH',
               8, 0, 8, 'Depot delivery', 'Joyce W.', $1)`,
      [key],
    );

    // Re-submitting the gas row for the same key is a double-charge: blocked.
    const message = await expectFailure(
      `INSERT INTO stock_movements
         (ledger_kind, operation, occurred_at, location_id, variant_id, state,
          quantity, balance_before, balance_after, reason, actor, idempotency_key)
       VALUES ('GAS', 'PURCHASE', now(), 'loc-mlolongo', 'var-total-13', 'REFILL',
               8, 8, 16, 'Depot delivery', 'Joyce W.', $1)`,
      [key],
    );
    expect(message).toMatch(/uq_movement_idempotency/);
  });
});

describe("variant shape rule", () => {
  it("refuses a cylinder variant with no size", async () => {
    const message = await expectFailure(`
      INSERT INTO product_variants
        (id, code, category_id, brand_id, name, list_price_ksh)
      VALUES ('var-rubis-x', 'RUBIS-X', 'cat-lpg-cylinder', 'brand-rubis',
              'Mystery', 2350)
    `);
    expect(message).toMatch(/positive size_kg/);
  });

  it("refuses an accessory that declares a size", async () => {
    const message = await expectFailure(`
      INSERT INTO product_variants
        (id, code, category_id, brand_id, name, size_kg, list_price_ksh)
      VALUES ('var-bad-hose', 'ACC-BAD', 'cat-accessory', 'brand-rubis',
              'Confused hose', 6, 450)
    `);
    expect(message).toMatch(/must not declare size_kg/);
  });

  it("refuses two variants of the same brand and size", async () => {
    const message = await expectFailure(`
      INSERT INTO product_variants
        (id, code, category_id, brand_id, name, size_kg, list_price_ksh)
      VALUES ('var-afrigas-13b', 'AFRIGAS-13B', 'cat-lpg-cylinder', 'brand-afrigas',
              'Afri Gas 13 kg copy', 13, 2350)
    `);
    expect(message).toMatch(/duplicate key/i);
  });
});

describe("pricing is visible", () => {
  beforeAll(async () => {
    await db.exec(`
      INSERT INTO sales (id, location_id, channel, sale_type, payment_method,
                         recorded_by, list_total_ksh, total_ksh)
      VALUES ('SALE-1', 'loc-syokimau', 'WALK_IN', 'REFILL', 'MPESA',
              'Joyce W.', 4700, 4400)
    `);
  });

  it("refuses a price off list with no reason", async () => {
    const message = await expectFailure(`
      INSERT INTO sale_lines (sale_id, id, variant_id, quantity, list_price_ksh, unit_price_ksh)
      VALUES ('SALE-1', 'LINE-1', 'var-afrigas-13', 2, 2350, 2200)
    `);
    expect(message).toMatch(/price_deviation_needs_reason/);
  });

  it("refuses a reason too short to explain a discount", async () => {
    const message = await expectFailure(`
      INSERT INTO sale_lines (sale_id, id, variant_id, quantity, list_price_ksh,
                              unit_price_ksh, discount_reason)
      VALUES ('SALE-1', 'LINE-2', 'var-afrigas-13', 2, 2350, 2200, 'ok')
    `);
    expect(message).toMatch(/discount_reason/);
  });

  it("accepts a discount with a reason, and computes the line total", async () => {
    await db.exec(`
      INSERT INTO sale_lines (sale_id, id, variant_id, quantity, list_price_ksh,
                              unit_price_ksh, discount_reason)
      VALUES ('SALE-1', 'LINE-3', 'var-afrigas-13', 2, 2350, 2200,
              'Regular customer rate')
    `);
    const { rows } = await db.query<{ line_total_ksh: string }>(
      "SELECT line_total_ksh FROM sale_lines WHERE id = 'LINE-3'",
    );
    expect(Number(rows[0].line_total_ksh)).toBe(4400);
  });

  it("makes discounted lines findable through the partial index", async () => {
    const { rows } = await db.query<{ id: string }>(
      "SELECT id FROM sale_lines WHERE discount_reason IS NOT NULL",
    );
    expect(rows.map((r) => r.id)).toEqual(["LINE-3"]);
  });
});

describe("reporting views", () => {
  beforeAll(async () => {
    await db.exec(`
      INSERT INTO inventory_positions (location_id, variant_id, state, quantity) VALUES
        ('loc-syokimau', 'var-total-13', 'REFILL', 27),
        ('loc-syokimau', 'var-total-13', 'EMPTY',   9),
        ('van-01',       'var-afrigas-13', 'REFILL', 3),
        ('van-01',       'var-afrigas-13', 'EMPTY',  4)
    `);
  });

  it("values filled stock and only counts gas in refills", async () => {
    const { rows } = await db.query<{
      state: string;
      value_ksh: string;
      gas_kg: string;
    }>(`
      SELECT state, value_ksh, gas_kg FROM v_inventory_value
       WHERE location_id = 'loc-syokimau' AND variant_id = 'var-total-13'
       ORDER BY state
    `);

    const empty = rows.find((r) => r.state === "EMPTY")!;
    const refill = rows.find((r) => r.state === "REFILL")!;

    expect(Number(refill.value_ksh)).toBe(27 * 2400);
    expect(Number(refill.gas_kg)).toBe(27 * 13);
    // Empties still carry value, but hold no gas.
    expect(Number(empty.gas_kg)).toBe(0);
    expect(Number(empty.value_ksh)).toBe(9 * 2400);
  });

  it("counts cylinders as filled plus empty: 3 + 4 = 7", async () => {
    const { rows } = await db.query<{
      refills: number;
      empties: number;
      cylinders: number;
      location_kind: string;
    }>(`
      SELECT c.refills, c.empties, c.cylinders, v.location_kind
        FROM v_cylinder_counts c
        JOIN v_inventory_value v USING (location_id, variant_id)
       WHERE c.location_id = 'van-01' AND c.variant_id = 'var-afrigas-13'
       LIMIT 1
    `);

    expect(rows[0]).toMatchObject({
      refills: 3,
      empties: 4,
      cylinders: 7,
      location_kind: "VAN",
    });
  });
});
