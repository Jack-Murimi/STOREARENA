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

    INSERT INTO branches (id, code, name, active) VALUES
      ('br-syokimau',   'SYK', 'Gateway Gas — Syokimau', true),
      ('br-mlolongo',   'MLO', 'Gateway Gas — Mlolongo', true),
      ('br-athi-river', 'ATR', 'Gateway Gas — Athi River', false);

    INSERT INTO product_variants
      (id, code, category_id, brand_id, name, size_kg, refill_price_ksh, deposit_ksh)
    VALUES
      ('var-afrigas-13', 'AFRIGAS-13', 'cat-lpg-cylinder', 'brand-afrigas', 'Afri Gas 13 kg',      13, 2350, 2600),
      ('var-total-13',   'TOTAL-13',   'cat-lpg-cylinder', 'brand-total',   'TotalEnergies 13 kg', 13, 2400, 2700);

    INSERT INTO product_variants
      (id, code, category_id, brand_id, name, refill_price_ksh)
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
      "branches",
      "brands",
      "categories",
      "cylinder_custody",
      "inventory_positions",
      "product_variants",
      "sale_lines",
      "sales",
      "stock_movements",
    ]);
  });

  it("exposes a reporting view", async () => {
    const { rows } = await db.query<{ viewname: string }>(`
      SELECT viewname FROM pg_views WHERE schemaname = 'public'
    `);
    expect(rows.map((r) => r.viewname)).toContain("v_inventory_value");
  });
});

describe("gas stock constraints", () => {
  it("refuses a negative position quantity", async () => {
    const message = await expectFailure(`
      INSERT INTO inventory_positions (branch_id, variant_id, state, quantity)
      VALUES ('br-syokimau', 'var-afrigas-13', 'REFILL', -1)
    `);
    expect(message).toMatch(/inventory_positions_quantity_check/);
  });

  it("refuses an unknown gas state", async () => {
    const message = await expectFailure(`
      INSERT INTO inventory_positions (branch_id, variant_id, state, quantity)
      VALUES ('br-syokimau', 'var-afrigas-13', 'HALF_FULL', 1)
    `);
    expect(message).toMatch(/state/);
  });

  it("holds one row per branch, variant and state", async () => {
    await db.exec(`
      INSERT INTO inventory_positions (branch_id, variant_id, state, quantity)
      VALUES ('br-syokimau', 'var-afrigas-13', 'REFILL', 23)
    `);
    const message = await expectFailure(`
      INSERT INTO inventory_positions (branch_id, variant_id, state, quantity)
      VALUES ('br-syokimau', 'var-afrigas-13', 'REFILL', 5)
    `);
    expect(message).toMatch(/duplicate key/i);
  });
});

describe("cylinder custody constraints", () => {
  it("refuses a negative cylinder count", async () => {
    const message = await expectFailure(`
      INSERT INTO cylinder_custody (branch_id, variant_id, custody, quantity)
      VALUES ('br-syokimau', 'var-afrigas-13', 'BRANCH', -2)
    `);
    expect(message).toMatch(/cylinder_custody_quantity_check/);
  });

  it("refuses an unknown custody location", async () => {
    const message = await expectFailure(`
      INSERT INTO cylinder_custody (branch_id, variant_id, custody, quantity)
      VALUES ('br-syokimau', 'var-afrigas-13', 'LOST', 1)
    `);
    expect(message).toMatch(/custody/);
  });
});

describe("audit ledger is append-only", () => {
  it("accepts an insert", async () => {
    await db.exec(`
      INSERT INTO stock_movements
        (ledger_kind, operation, occurred_at, branch_id, variant_id, state,
         quantity, balance_before, balance_after, reason, actor, reference)
      VALUES
        ('GAS', 'PURCHASE', now(), 'br-syokimau', 'var-afrigas-13', 'REFILL',
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
        (ledger_kind, operation, occurred_at, branch_id, variant_id, state,
         quantity, balance_before, balance_after, reason, actor)
      VALUES
        ('GAS', 'REFILL_SALE', now(), 'br-syokimau', 'var-afrigas-13', 'REFILL',
         -3, 23, 25, 'Counter sale', 'Joyce W.')
    `);
    expect(message).toMatch(/movement_balance_consistent/);
  });

  it("refuses a reason too short to be useful", async () => {
    const message = await expectFailure(`
      INSERT INTO stock_movements
        (ledger_kind, operation, occurred_at, branch_id, variant_id, state,
         quantity, balance_before, balance_after, reason, actor)
      VALUES
        ('GAS', 'STOCKTAKE', now(), 'br-syokimau', 'var-afrigas-13', 'REFILL',
         0, 23, 23, 'n/a', 'Brian O.')
    `);
    expect(message).toMatch(/reason/);
  });

  it("refuses a gas row that claims a custody, and vice versa", async () => {
    const message = await expectFailure(`
      INSERT INTO stock_movements
        (ledger_kind, operation, occurred_at, branch_id, variant_id, state, custody,
         quantity, balance_before, balance_after, reason, actor)
      VALUES
        ('GAS', 'PURCHASE', now(), 'br-syokimau', 'var-afrigas-13', 'REFILL', 'BRANCH',
         1, 23, 24, 'Impossible row', 'seed')
    `);
    expect(message).toMatch(/movement_ledger_shape/);
  });

  it("refuses a transfer recorded against itself", async () => {
    const message = await expectFailure(`
      INSERT INTO stock_movements
        (ledger_kind, operation, occurred_at, branch_id, counterparty_branch_id,
         variant_id, state, quantity, balance_before, balance_after, reason, actor)
      VALUES
        ('GAS', 'TRANSFER', now(), 'br-syokimau', 'br-syokimau',
         'var-afrigas-13', 'REFILL', 1, 23, 24, 'Self transfer', 'seed')
    `);
    expect(message).toMatch(/movement_no_self_counterparty/);
  });
});

describe("idempotency at the database level", () => {
  it("allows several rows for one command, but not the same row twice", async () => {
    const key = "MPESA-OPK7Q2X9L4";

    // A purchase writes a gas row and a custody row under one key: allowed.
    await db.query(
      `INSERT INTO stock_movements
         (ledger_kind, operation, occurred_at, branch_id, variant_id, state,
          quantity, balance_before, balance_after, reason, actor, idempotency_key)
       VALUES ('GAS', 'PURCHASE', now(), 'br-mlolongo', 'var-total-13', 'REFILL',
               8, 0, 8, 'Depot delivery', 'Joyce W.', $1)`,
      [key],
    );
    await db.query(
      `INSERT INTO stock_movements
         (ledger_kind, operation, occurred_at, branch_id, variant_id, custody,
          quantity, balance_before, balance_after, reason, actor, idempotency_key)
       VALUES ('CYLINDER', 'PURCHASE', now(), 'br-mlolongo', 'var-total-13', 'BRANCH',
               8, 0, 8, 'Depot delivery', 'Joyce W.', $1)`,
      [key],
    );

    // Re-submitting the gas row for the same key is a double-charge: blocked.
    const message = await expectFailure(
      `INSERT INTO stock_movements
         (ledger_kind, operation, occurred_at, branch_id, variant_id, state,
          quantity, balance_before, balance_after, reason, actor, idempotency_key)
       VALUES ('GAS', 'PURCHASE', now(), 'br-mlolongo', 'var-total-13', 'REFILL',
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
        (id, code, category_id, brand_id, name, refill_price_ksh, deposit_ksh)
      VALUES ('var-rubis-x', 'RUBIS-X', 'cat-lpg-cylinder', 'brand-rubis',
              'Mystery', 2350, 2600)
    `);
    expect(message).toMatch(/positive size_kg/);
  });

  it("refuses an accessory that declares a size", async () => {
    const message = await expectFailure(`
      INSERT INTO product_variants
        (id, code, category_id, brand_id, name, size_kg, refill_price_ksh)
      VALUES ('var-bad-hose', 'ACC-BAD', 'cat-accessory', 'brand-rubis',
              'Confused hose', 6, 450)
    `);
    expect(message).toMatch(/must not declare size_kg/);
  });

  it("refuses two variants of the same brand and size", async () => {
    const message = await expectFailure(`
      INSERT INTO product_variants
        (id, code, category_id, brand_id, name, size_kg, refill_price_ksh, deposit_ksh)
      VALUES ('var-afrigas-13b', 'AFRIGAS-13B', 'cat-lpg-cylinder', 'brand-afrigas',
              'Afri Gas 13 kg copy', 13, 2350, 2600)
    `);
    expect(message).toMatch(/duplicate key/i);
  });
});

describe("reporting view", () => {
  it("values filled stock and only counts gas in refills", async () => {
    await db.exec(`
      INSERT INTO inventory_positions (branch_id, variant_id, state, quantity) VALUES
        ('br-syokimau', 'var-total-13', 'REFILL', 27),
        ('br-syokimau', 'var-total-13', 'EMPTY', 9)
    `);

    const { rows } = await db.query<{
      state: string;
      quantity: number;
      value_ksh: string;
      gas_kg: string;
    }>(`
      SELECT state, quantity, value_ksh, gas_kg FROM v_inventory_value
       WHERE branch_id = 'br-syokimau' AND variant_id = 'var-total-13'
       ORDER BY state
    `);

    const empty = rows.find((r) => r.state === "EMPTY")!;
    const refill = rows.find((r) => r.state === "REFILL")!;

    expect(Number(refill.value_ksh)).toBe(27 * 2400);
    expect(Number(refill.gas_kg)).toBe(27 * 13);
    // Empties still carry deposit value, but hold no gas.
    expect(Number(empty.gas_kg)).toBe(0);
    expect(Number(empty.value_ksh)).toBe(9 * 2400);
  });
});
