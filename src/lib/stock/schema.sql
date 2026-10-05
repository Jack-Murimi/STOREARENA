-- ============================================================================
--  Gateway Gas Enterprises — LPG stock schema (PostgreSQL 14+)
--
--  Mirrors src/lib/stock/ one-to-one. The domain service is the only writer;
--  these constraints exist so that a bug, a bad migration or a hand-run query
--  cannot quietly corrupt stock.
--
--  Two ledgers, two tables, never conflated:
--    inventory_positions  -> gas stock  (REFILL / EMPTY)
--    cylinder_custody     -> where the company's own shells are
-- ============================================================================

BEGIN;

-- ------------------------------------------------------------- reference data

CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  stock_model TEXT NOT NULL CHECK (stock_model IN ('CYLINDER', 'SIMPLE')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE brands (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  depot_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE branches (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  category_id      TEXT NOT NULL REFERENCES categories (id),
  brand_id         TEXT NOT NULL REFERENCES brands (id),
  name             TEXT NOT NULL,
  size_kg          NUMERIC(6, 2) CHECK (size_kg IS NULL OR size_kg > 0),
  refill_price_ksh NUMERIC(12, 2) CHECK (refill_price_ksh IS NULL OR refill_price_ksh >= 0),
  deposit_ksh      NUMERIC(12, 2) CHECK (deposit_ksh IS NULL OR deposit_ksh >= 0),
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, size_kg)
);

-- A cylinder variant must declare a size; an accessory must not. The rule spans
-- two tables, so it lives in a trigger rather than a CHECK.
CREATE FUNCTION assert_variant_shape() RETURNS trigger AS $$
DECLARE
  v_model TEXT;
BEGIN
  SELECT c.stock_model INTO v_model FROM categories c WHERE c.id = NEW.category_id;
  IF v_model IS NULL THEN
    RAISE EXCEPTION 'unknown category %', NEW.category_id;
  END IF;
  IF v_model = 'CYLINDER' AND (NEW.size_kg IS NULL OR NEW.size_kg <= 0) THEN
    RAISE EXCEPTION 'cylinder variants must declare a positive size_kg';
  END IF;
  IF v_model <> 'CYLINDER' AND NEW.size_kg IS NOT NULL THEN
    RAISE EXCEPTION 'non-cylinder variants must not declare size_kg';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_variant_shape
  BEFORE INSERT OR UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION assert_variant_shape();

-- ------------------------------------------------------------- gas stock

CREATE TABLE inventory_positions (
  branch_id  TEXT NOT NULL REFERENCES branches (id),
  variant_id TEXT NOT NULL REFERENCES product_variants (id),
  state      TEXT NOT NULL CHECK (state IN ('REFILL', 'EMPTY')),
  quantity   INTEGER NOT NULL CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, variant_id, state)
);

-- --------------------------------------------------------- cylinder custody

CREATE TABLE cylinder_custody (
  branch_id  TEXT NOT NULL REFERENCES branches (id),
  variant_id TEXT NOT NULL REFERENCES product_variants (id),
  custody    TEXT NOT NULL CHECK (custody IN ('BRANCH', 'DEPOT', 'CUSTOMER', 'IN_TRANSIT')),
  quantity   INTEGER NOT NULL CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, variant_id, custody)
);

-- ------------------------------------------------------------- audit ledger

CREATE TABLE stock_movements (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ledger_kind            TEXT NOT NULL CHECK (ledger_kind IN ('GAS', 'CYLINDER')),
  operation              TEXT NOT NULL CHECK (operation IN (
                           'PURCHASE', 'REFILL_SALE', 'NEW_CYLINDER_SALE', 'EXCHANGE',
                           'EMPTY_RETURN', 'DEPOT_RETURN', 'TRANSFER', 'STOCKTAKE'
                         )),
  occurred_at            TIMESTAMPTZ NOT NULL,
  recorded_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  branch_id              TEXT NOT NULL REFERENCES branches (id),
  counterparty_branch_id TEXT REFERENCES branches (id),
  variant_id             TEXT NOT NULL REFERENCES product_variants (id),
  state                  TEXT CHECK (state IS NULL OR state IN ('REFILL', 'EMPTY')),
  custody                TEXT CHECK (custody IS NULL OR custody IN
                           ('BRANCH', 'DEPOT', 'CUSTOMER', 'IN_TRANSIT')),
  quantity               INTEGER NOT NULL,
  balance_before         INTEGER NOT NULL,
  balance_after          INTEGER NOT NULL,
  reason                 TEXT NOT NULL CHECK (char_length(trim(reason)) >= 5),
  reference              TEXT,
  actor                  TEXT NOT NULL,
  idempotency_key        TEXT,
  -- Which position this row belongs to, so an idempotency key can cover a
  -- multi-row command without allowing the same row twice.
  movement_slot          TEXT GENERATED ALWAYS AS (COALESCE(state, custody)) STORED,

  CONSTRAINT movement_ledger_shape CHECK (
    (ledger_kind = 'GAS'      AND state IS NOT NULL   AND custody IS NULL) OR
    (ledger_kind = 'CYLINDER' AND custody IS NOT NULL AND state IS NULL)
  ),
  CONSTRAINT movement_balance_consistent CHECK (balance_after = balance_before + quantity),
  CONSTRAINT movement_no_self_counterparty CHECK (
    counterparty_branch_id IS NULL OR counterparty_branch_id <> branch_id
  )
);

CREATE UNIQUE INDEX uq_movement_idempotency
  ON stock_movements (idempotency_key, branch_id, variant_id, movement_slot)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_movements_branch_time ON stock_movements (branch_id, occurred_at DESC);
CREATE INDEX idx_movements_variant_time ON stock_movements (variant_id, occurred_at DESC);
CREATE INDEX idx_movements_operation ON stock_movements (operation, occurred_at DESC);

-- History is history. Corrections are new movements, never edits.
CREATE FUNCTION reject_movement_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_movements_append_only
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION reject_movement_mutation();

-- ------------------------------------------------------------------- sales

CREATE TABLE sales (
  id              TEXT PRIMARY KEY,
  branch_id       TEXT NOT NULL REFERENCES branches (id),
  sold_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  sale_type       TEXT NOT NULL CHECK (sale_type IN ('REFILL', 'NEW_CYLINDER', 'EXCHANGE')),
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('MPESA', 'CASH', 'CARD', 'BANK_TRANSFER')),
  customer_ref    TEXT,
  recorded_by     TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  total_ksh       NUMERIC(12, 2) NOT NULL CHECK (total_ksh >= 0)
);

CREATE TABLE sale_lines (
  id               TEXT PRIMARY KEY,
  sale_id          TEXT NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  variant_id       TEXT NOT NULL REFERENCES product_variants (id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_ksh   NUMERIC(12, 2) NOT NULL CHECK (unit_price_ksh >= 0),
  empties_received INTEGER NOT NULL DEFAULT 0
                   CHECK (empties_received >= 0 AND empties_received <= quantity),
  line_total_ksh   NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * unit_price_ksh) STORED
);

CREATE INDEX idx_sale_lines_sale ON sale_lines (sale_id);
CREATE INDEX idx_sales_branch_time ON sales (branch_id, sold_at DESC);

-- ------------------------------------------------------------------- reporting

CREATE VIEW v_inventory_value AS
SELECT p.branch_id,
       b.name                                     AS branch_name,
       p.variant_id,
       v.name                                     AS variant_name,
       br.name                                    AS brand_name,
       p.state,
       p.quantity,
       v.size_kg,
       v.refill_price_ksh,
       COALESCE(p.quantity * v.refill_price_ksh, 0) AS value_ksh,
       CASE WHEN p.state = 'REFILL'
            THEN COALESCE(p.quantity * v.size_kg, 0)
            ELSE 0 END                            AS gas_kg
  FROM inventory_positions p
  JOIN branches b         ON b.id = p.branch_id
  JOIN product_variants v ON v.id = p.variant_id
  JOIN brands br          ON br.id = v.brand_id;

COMMIT;
