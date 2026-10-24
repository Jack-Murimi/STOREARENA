-- ============================================================================
--  Shift counts — end-of-shift physical count submitted by the attendant
--
--  The attendant counts what they see (refills + empties) and the system
--  shows the variance against the ledger immediately. Admin resolves any gap.
--  counted_by comes from the authenticated session, never free-text input.
-- ============================================================================

CREATE TABLE shift_counts (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES stock_locations (id),
  variant_id  TEXT NOT NULL REFERENCES product_variants (id),
  counted_by  TEXT NOT NULL,           -- staff full name (from auth, not free-text input)
  counted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  count_date  DATE NOT NULL,           -- the calendar date this count is for
  refills     INTEGER NOT NULL CHECK (refills >= 0),
  empties     INTEGER NOT NULL CHECK (empties >= 0),
  -- ledger snapshot at time of count (for instant variance display)
  ledger_refills INTEGER NOT NULL,
  ledger_empties INTEGER NOT NULL,
  -- optional note from the attendant
  note        TEXT,
  -- admin resolution
  resolved    BOOLEAN NOT NULL DEFAULT false,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_note TEXT
);

CREATE INDEX idx_shift_counts_location_date ON shift_counts (location_id, count_date DESC);
CREATE INDEX idx_shift_counts_unresolved ON shift_counts (count_date DESC) WHERE NOT resolved;

-- A view that shows variance immediately
CREATE VIEW v_shift_count_variances AS
SELECT
  sc.id,
  sc.count_date,
  sc.counted_by,
  sc.counted_at,
  sc.resolved,
  sc.resolved_by,
  sc.resolved_at,
  sc.resolved_note,
  sc.note,
  sl.id   AS location_id,
  sl.name AS location_name,
  pv.id   AS variant_id,
  pv.name AS variant_name,
  b.name  AS brand_name,
  pv.size_kg,
  sc.refills,
  sc.empties,
  sc.ledger_refills,
  sc.ledger_empties,
  (sc.refills     - sc.ledger_refills) AS refill_variance,
  (sc.empties     - sc.ledger_empties) AS empty_variance,
  (sc.refills + sc.empties) - (sc.ledger_refills + sc.ledger_empties) AS total_variance
FROM shift_counts sc
JOIN stock_locations sl ON sl.id = sc.location_id
JOIN product_variants pv ON pv.id = sc.variant_id
JOIN brands b ON b.id = pv.brand_id;
