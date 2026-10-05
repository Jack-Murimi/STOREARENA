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
--
--  A "location" is either a branch or a rider's van. Vans hold stock, so what
--  is on the road is visible and reconcilable, not a gap in the branch count.
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

CREATE TABLE stock_locations (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('BRANCH', 'VAN')),
  home_location_id TEXT REFERENCES stock_locations (id),
  rider            TEXT,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A van belongs to a branch and has someone responsible for it.
  CONSTRAINT van_needs_branch_and_rider CHECK (
    kind <> 'VAN' OR (home_location_id IS NOT NULL AND rider IS NOT NULL)
  ),
  CONSTRAINT branch_has_no_home CHECK (
    kind <> 'BRANCH' OR home_location_id IS NULL
  ),
  CONSTRAINT location_not_own_home CHECK (
    home_location_id IS NULL OR home_location_id <> id
  )
);

CREATE TABLE product_variants (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  category_id    TEXT NOT NULL REFERENCES categories (id),
  brand_id       TEXT NOT NULL REFERENCES brands (id),
  name           TEXT NOT NULL,
  size_kg        NUMERIC(6, 2) CHECK (size_kg IS NULL OR size_kg > 0),
  -- The standard price. What a customer actually pays lives on the sale line,
  -- so a discount is always the visible gap between the two.
  list_price_ksh NUMERIC(12, 2) CHECK (list_price_ksh IS NULL OR list_price_ksh > 0),
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
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
  location_id TEXT NOT NULL REFERENCES stock_locations (id),
  variant_id  TEXT NOT NULL REFERENCES product_variants (id),
  state       TEXT NOT NULL CHECK (state IN ('REFILL', 'EMPTY')),
  quantity    INTEGER NOT NULL CHECK (quantity >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, variant_id, state)
);

-- --------------------------------------------------------- cylinder custody

CREATE TABLE cylinder_custody (
  location_id TEXT NOT NULL REFERENCES stock_locations (id),
  variant_id  TEXT NOT NULL REFERENCES product_variants (id),
  custody     TEXT NOT NULL CHECK (custody IN ('BRANCH', 'DEPOT', 'CUSTOMER', 'IN_TRANSIT')),
  quantity    INTEGER NOT NULL CHECK (quantity >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, variant_id, custody)
);

-- ------------------------------------------------------------- audit ledger

CREATE TABLE stock_movements (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ledger_kind              TEXT NOT NULL CHECK (ledger_kind IN ('GAS', 'CYLINDER')),
  operation                TEXT NOT NULL CHECK (operation IN (
                             'PURCHASE', 'REFILL_SALE', 'NEW_CYLINDER_SALE', 'EXCHANGE',
                             'EMPTY_RETURN', 'DEPOT_RETURN', 'TRANSFER', 'STOCKTAKE'
                           )),
  channel                  TEXT NOT NULL DEFAULT 'INTERNAL'
                           CHECK (channel IN ('WALK_IN', 'DELIVERY', 'INTERNAL')),
  occurred_at              TIMESTAMPTZ NOT NULL,
  recorded_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  location_id              TEXT NOT NULL REFERENCES stock_locations (id),
  counterparty_location_id TEXT REFERENCES stock_locations (id),
  variant_id               TEXT NOT NULL REFERENCES product_variants (id),
  state                    TEXT CHECK (state IS NULL OR state IN ('REFILL', 'EMPTY')),
  custody                  TEXT CHECK (custody IS NULL OR custody IN
                             ('BRANCH', 'DEPOT', 'CUSTOMER', 'IN_TRANSIT')),
  quantity                 INTEGER NOT NULL,
  balance_before           INTEGER NOT NULL,
  balance_after            INTEGER NOT NULL,
  reason                   TEXT NOT NULL CHECK (char_length(trim(reason)) >= 5),
  reference                TEXT,
  -- Who did it. Never blank: a movement nobody owns is worthless.
  actor                    TEXT NOT NULL CHECK (char_length(trim(actor)) >= 2),
  idempotency_key          TEXT,
  -- Which position this row belongs to, so an idempotency key can cover a
  -- multi-row command without allowing the same row twice.
  movement_slot            TEXT GENERATED ALWAYS AS (COALESCE(state, custody)) STORED,

  CONSTRAINT movement_ledger_shape CHECK (
    (ledger_kind = 'GAS'      AND state IS NOT NULL   AND custody IS NULL) OR
    (ledger_kind = 'CYLINDER' AND custody IS NOT NULL AND state IS NULL)
  ),
  CONSTRAINT movement_balance_consistent CHECK (balance_after = balance_before + quantity),
  CONSTRAINT movement_no_self_counterparty CHECK (
    counterparty_location_id IS NULL OR counterparty_location_id <> location_id
  )
);

CREATE UNIQUE INDEX uq_movement_idempotency
  ON stock_movements (idempotency_key, location_id, variant_id, movement_slot)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_movements_location_time ON stock_movements (location_id, occurred_at DESC);
CREATE INDEX idx_movements_variant_time ON stock_movements (variant_id, occurred_at DESC);
CREATE INDEX idx_movements_operation ON stock_movements (operation, occurred_at DESC);
CREATE INDEX idx_movements_channel ON stock_movements (channel, occurred_at DESC);

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
--
-- No deposits are held and nothing extra is charged for the cylinder itself,
-- so a sale is gas and gas alone. What matters here is that the charged price
-- and the list price sit side by side, with the reason for any gap.

CREATE TABLE sales (
  id              TEXT PRIMARY KEY,
  location_id     TEXT NOT NULL REFERENCES stock_locations (id),
  channel         TEXT NOT NULL CHECK (channel IN ('WALK_IN', 'DELIVERY')),
  sold_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  sale_type       TEXT NOT NULL CHECK (sale_type IN ('REFILL', 'NEW_CYLINDER', 'EXCHANGE')),
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('MPESA', 'CASH', 'CARD', 'BANK_TRANSFER')),
  customer_ref    TEXT,
  recorded_by     TEXT NOT NULL CHECK (char_length(trim(recorded_by)) >= 2),
  idempotency_key TEXT UNIQUE,
  list_total_ksh  NUMERIC(12, 2) NOT NULL CHECK (list_total_ksh >= 0),
  total_ksh       NUMERIC(12, 2) NOT NULL CHECK (total_ksh >= 0)
);

CREATE TABLE sale_lines (
  id               TEXT PRIMARY KEY,
  sale_id          TEXT NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  variant_id       TEXT NOT NULL REFERENCES product_variants (id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  list_price_ksh   NUMERIC(12, 2) NOT NULL CHECK (list_price_ksh > 0),
  unit_price_ksh   NUMERIC(12, 2) NOT NULL CHECK (unit_price_ksh > 0),
  empties_received INTEGER NOT NULL DEFAULT 0
                   CHECK (empties_received >= 0 AND empties_received <= quantity),
  line_total_ksh   NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * unit_price_ksh) STORED,
  -- The rule the business asked for: a price off list is allowed, a silent one
  -- is not.
  discount_reason  TEXT CHECK (char_length(trim(discount_reason)) >= 5),
  CONSTRAINT price_deviation_needs_reason CHECK (
    unit_price_ksh = list_price_ksh OR discount_reason IS NOT NULL
  )
);

CREATE INDEX idx_sale_lines_sale ON sale_lines (sale_id);
CREATE INDEX idx_sales_location_time ON sales (location_id, sold_at DESC);
-- Discounts must be findable without scanning every line.
CREATE INDEX idx_sale_lines_discounted ON sale_lines (sale_id)
  WHERE discount_reason IS NOT NULL;

-- ------------------------------------------------------------------- reporting

CREATE VIEW v_inventory_value AS
SELECT p.location_id,
       l.name                                     AS location_name,
       l.kind                                     AS location_kind,
       p.variant_id,
       v.name                                     AS variant_name,
       br.name                                    AS brand_name,
       p.state,
       p.quantity,
       v.size_kg,
       v.list_price_ksh,
       COALESCE(p.quantity * v.list_price_ksh, 0) AS value_ksh,
       CASE WHEN p.state = 'REFILL'
            THEN COALESCE(p.quantity * v.size_kg, 0)
            ELSE 0 END                            AS gas_kg
  FROM inventory_positions p
  JOIN stock_locations l    ON l.id = p.location_id
  JOIN product_variants v   ON v.id = p.variant_id
  JOIN brands br            ON br.id = v.brand_id;

-- Cylinders are counted filled or empty; this is the "how many 13 kg Afri Gas
-- cylinders are standing here" number the staff actually ask for.
CREATE VIEW v_cylinder_counts AS
SELECT p.location_id,
       l.name       AS location_name,
       p.variant_id,
       v.name       AS variant_name,
       br.name      AS brand_name,
       v.size_kg,
       COALESCE(SUM(p.quantity) FILTER (WHERE p.state = 'REFILL'), 0) AS refills,
       COALESCE(SUM(p.quantity) FILTER (WHERE p.state = 'EMPTY'), 0)  AS empties,
       SUM(p.quantity)                                                AS cylinders
  FROM inventory_positions p
  JOIN stock_locations l  ON l.id = p.location_id
  JOIN product_variants v ON v.id = p.variant_id
  JOIN brands br          ON br.id = v.brand_id
 GROUP BY p.location_id, l.name, p.variant_id, v.name, br.name, v.size_kg;

COMMIT;
