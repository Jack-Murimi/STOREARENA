/**
 * The `.sql` files, embedded as strings.
 *
 * Generated — do not edit by hand. Run `npm run sync-schema` after changing
 * a .sql file; a test fails if the two drift apart.
 *
 * They are embedded because a deployed server has no source tree to read
 * from: Netlify ships the build output, not `src/`.
 */
export const CUSTOMER_SCHEMA = `-- ============================================================================
--  Gateway Gas Enterprises — Customers (PostgreSQL 14+ / Supabase)
--
--  A customer is a household or a business. They may have several delivery
--  locations (main house, annex, shop) and several phone numbers, each with the
--  name of the person who answers it and, optionally, their role in the house —
--  wife, father, children, maid, caretaker.
--
--  Paste this into Supabase -> SQL Editor and run it once.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS customers (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
  kind       TEXT NOT NULL DEFAULT 'HOUSEHOLD'
             CHECK (kind IN ('HOUSEHOLD', 'BUSINESS')),
  notes      TEXT,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customers_notes_meaningful CHECK (notes IS NULL OR char_length(trim(notes)) >= 3)
);

-- ------------------------------------------------------------- delivery sites

CREATE TABLE IF NOT EXISTS customer_locations (
  id           TEXT PRIMARY KEY,
  customer_id  TEXT NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  label        TEXT NOT NULL CHECK (char_length(trim(label)) >= 2),
  -- Free text on purpose: "house no 46 on Kinyajui road off Naivasha road".
  address_line TEXT,
  -- The bit that actually gets you through the gate: "opposite Fryz Inn hotel".
  details      TEXT,
  area         TEXT,
  town         TEXT,
  -- Optional map pin, so a rider can be sent coordinates rather than a guess.
  pin_lat      NUMERIC(9, 6) CHECK (pin_lat IS NULL OR (pin_lat >= -90 AND pin_lat <= 90)),
  pin_lng      NUMERIC(9, 6) CHECK (pin_lng IS NULL OR (pin_lng >= -180 AND pin_lng <= 180)),
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pin_is_a_pair CHECK (
    (pin_lat IS NULL AND pin_lng IS NULL) OR (pin_lat IS NOT NULL AND pin_lng IS NOT NULL)
  ),
  -- One "Main house" per customer.
  CONSTRAINT customer_location_label_unique UNIQUE (customer_id, label)
);

-- Exactly one primary location per customer, and never none: the partial index
-- allows at most one true, and the trigger below refuses to leave zero.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_primary_location
  ON customer_locations (customer_id) WHERE is_primary;

-- ------------------------------------------------------------------ contacts

CREATE TABLE IF NOT EXISTS customer_contacts (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  -- Stored normalised (+2547xxxxxxxx) so M-Pesa and lookups match reliably.
  phone       TEXT NOT NULL CHECK (phone ~ '^\\+254[17][0-9]{8}$'),
  name        TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
  -- Optional on purpose: a house has wife, father, children, maid, caretaker...
  role        TEXT CHECK (role IS NULL OR char_length(trim(role)) >= 2),
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One number, one account. A number shared between two customers makes
  -- "who did we deliver to?" unanswerable, and lets a typo create a second
  -- record for somebody who is already on the books.
  CONSTRAINT customer_contact_phone_unique UNIQUE (phone)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_primary_contact
  ON customer_contacts (customer_id) WHERE is_primary;

-- (The UNIQUE constraint above already indexes phone, so no extra index.)
CREATE INDEX IF NOT EXISTS idx_customer_locations_area ON customer_locations (area);

-- ------------------------------------------------------- business invariants

-- A customer must always have at least one location and one phone number; a
-- record you cannot deliver to or call is not a customer. Deleting the customer
-- itself is fine — the cascade takes the children with it.
CREATE OR REPLACE FUNCTION assert_customer_still_reachable() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = OLD.customer_id) THEN
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME = 'customer_locations'
     AND NOT EXISTS (SELECT 1 FROM customer_locations WHERE customer_id = OLD.customer_id) THEN
    RAISE EXCEPTION 'customer % would be left with no delivery location', OLD.customer_id;
  END IF;
  IF TG_TABLE_NAME = 'customer_contacts'
     AND NOT EXISTS (SELECT 1 FROM customer_contacts WHERE customer_id = OLD.customer_id) THEN
    RAISE EXCEPTION 'customer % would be left with no phone number', OLD.customer_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_keeps_location ON customer_locations;
CREATE CONSTRAINT TRIGGER trg_customer_keeps_location
  AFTER DELETE ON customer_locations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_customer_still_reachable();

DROP TRIGGER IF EXISTS trg_customer_keeps_phone ON customer_contacts;
CREATE CONSTRAINT TRIGGER trg_customer_keeps_phone
  AFTER DELETE ON customer_contacts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_customer_still_reachable();

-- --------------------------------------------------------------- convenience

-- Everything the rider screen needs in one row per contact.
CREATE OR REPLACE VIEW v_customer_directory AS
SELECT c.id            AS customer_id,
       c.code,
       c.name          AS customer_name,
       c.kind,
       c.active,
       l.label         AS location_label,
       l.address_line,
       l.details,
       l.area,
       l.town,
       l.pin_lat,
       l.pin_lng,
       l.is_primary    AS primary_location,
       ct.name         AS contact_name,
       ct.phone,
       ct.role,
       ct.is_primary   AS primary_contact
  FROM customers c
  JOIN customer_locations l ON l.customer_id = c.id
  JOIN customer_contacts ct ON ct.customer_id = c.id;

COMMIT;
`;

/** Invoices, payments and the balances that fall out of them. */
export const BILLING_SCHEMA = `-- Invoices, payments and the balance that falls out of them.
--
-- An invoice is raised when gas goes out; a payment is money coming back.
-- A customer's balance is simply everything invoiced minus everything paid,
-- and credit is normal here — nobody is blocked from ordering because they
-- still owe last month.
--
-- Payments are spread over the oldest unpaid invoices first, so every
-- invoice can say whether it is open, part-paid or settled, and a statement
-- reads the way a customer expects.
--
-- Re-runnable: safe to apply on every boot.

CREATE TABLE IF NOT EXISTS invoices (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  -- The gas sale this invoice came from, when it came from one. Left free of
  -- a foreign key so the billing ledger stands up whether or not the stock
  -- tables have been created yet.
  sale_id     TEXT,
  reference   TEXT NOT NULL UNIQUE,
  issued_on   DATE NOT NULL DEFAULT current_date,
  notes       TEXT CHECK (notes IS NULL OR char_length(trim(notes)) >= 3),
  cancelled   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices (customer_id, issued_on);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id           TEXT PRIMARY KEY,
  invoice_id   TEXT NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  description  TEXT NOT NULL CHECK (char_length(trim(description)) >= 2),
  -- Set when the line came from a stock sale, so the cylinder trail and the
  -- money trail can be joined back up later.
  variant_id   TEXT,
  quantity     NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  line_total   NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  -- Lines print in the order they were entered, which random ids cannot give.
  position     INTEGER NOT NULL DEFAULT 0
);

-- For a database created before \`position\` existed.
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines (invoice_id);

CREATE TABLE IF NOT EXISTS payments (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  method      TEXT NOT NULL CHECK (
    method IN ('MPESA', 'CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD')
  ),
  -- M-Pesa code, cheque number, bank slip — whatever proves it happened.
  reference   TEXT,
  received_on DATE NOT NULL DEFAULT current_date,
  notes       TEXT CHECK (notes IS NULL OR char_length(trim(notes)) >= 3),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments (customer_id, received_on);

-- Which invoice a payment was put against. Enforced in the service layer to
-- never allocate more than an invoice still owes.
CREATE TABLE IF NOT EXISTS payment_allocations (
  payment_id TEXT NOT NULL REFERENCES payments (id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  amount     NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (payment_id, invoice_id)
);

-- An invoice can never be allocated more than it totals.
CREATE OR REPLACE FUNCTION assert_allocation_within_invoice() RETURNS trigger AS $$
DECLARE
  invoiced NUMERIC(12, 2);
  taken    NUMERIC(12, 2);
BEGIN
  SELECT coalesce(sum(l.line_total), 0) INTO invoiced
    FROM invoice_lines l WHERE l.invoice_id = NEW.invoice_id;
  SELECT coalesce(sum(a.amount), 0) INTO taken
    FROM payment_allocations a WHERE a.invoice_id = NEW.invoice_id;
  IF taken > invoiced THEN
    RAISE EXCEPTION 'invoice % would be over-allocated (% paid against % invoiced)',
      NEW.invoice_id, taken, invoiced;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_allocation_within_invoice ON payment_allocations;
CREATE CONSTRAINT TRIGGER trg_allocation_within_invoice
  AFTER INSERT ON payment_allocations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_allocation_within_invoice();

-- What each customer owes. Cancelled invoices drop out of the total, so a
-- mistake can be voided without deleting the record.
CREATE OR REPLACE VIEW v_customer_balance AS
SELECT
  c.id,
  c.code,
  c.name,
  coalesce(inv.invoiced, 0)                          AS invoiced,
  coalesce(pay.paid, 0)                              AS paid,
  coalesce(inv.invoiced, 0) - coalesce(pay.paid, 0)  AS balance,
  coalesce(inv.invoice_count, 0)                     AS invoice_count,
  coalesce(pay.payment_count, 0)                     AS payment_count
FROM customers c
LEFT JOIN (
  SELECT i.customer_id,
         sum(l.line_total) FILTER (WHERE NOT i.cancelled) AS invoiced,
         count(DISTINCT i.id) FILTER (WHERE NOT i.cancelled) AS invoice_count
    FROM invoices i
    LEFT JOIN invoice_lines l ON l.invoice_id = i.id
   GROUP BY i.customer_id
) inv ON inv.customer_id = c.id
LEFT JOIN (
  SELECT p.customer_id, sum(p.amount) AS paid, count(*) AS payment_count
    FROM payments p
   GROUP BY p.customer_id
) pay ON pay.customer_id = c.id;

-- How much one invoice still owes, for the "open / part-paid / settled" pill.
CREATE OR REPLACE VIEW v_invoice_outstanding AS
SELECT
  i.id,
  i.customer_id,
  i.reference,
  i.issued_on,
  i.cancelled,
  coalesce(l.total, 0)                                     AS total,
  coalesce(a.allocated, 0)                                 AS allocated,
  CASE WHEN i.cancelled THEN 0
       ELSE coalesce(l.total, 0) - coalesce(a.allocated, 0)
  END                                                      AS outstanding
FROM invoices i
LEFT JOIN (
  SELECT invoice_id, sum(line_total) AS total
    FROM invoice_lines GROUP BY invoice_id
) l ON l.invoice_id = i.id
LEFT JOIN (
  SELECT invoice_id, sum(amount) AS allocated
    FROM payment_allocations GROUP BY invoice_id
) a ON a.invoice_id = i.id;
`;
