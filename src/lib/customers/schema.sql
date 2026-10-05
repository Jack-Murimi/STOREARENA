-- ============================================================================
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
  address_line TEXT,
  area         TEXT,
  town         TEXT,
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
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
  phone       TEXT NOT NULL CHECK (phone ~ '^\+254[17][0-9]{8}$'),
  name        TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
  -- Optional on purpose: a house has wife, father, children, maid, caretaker...
  role        TEXT CHECK (role IS NULL OR char_length(trim(role)) >= 2),
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The same person may answer for two households, so uniqueness is per
  -- customer, not global.
  CONSTRAINT customer_contact_phone_unique UNIQUE (customer_id, phone)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_primary_contact
  ON customer_contacts (customer_id) WHERE is_primary;

-- "Who do we call for this area?" is a delivery-time question.
CREATE INDEX IF NOT EXISTS idx_customer_contacts_phone ON customer_contacts (phone);
CREATE INDEX IF NOT EXISTS idx_customer_locations_area ON customer_locations (area);

-- ------------------------------------------------------- business invariants

-- A customer must always have at least one location and one phone number; a
-- record you cannot deliver to or call is not a customer. Deleting the customer
-- itself is fine — the cascade takes the children with it.
CREATE FUNCTION assert_customer_still_reachable() RETURNS trigger AS $$
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

CREATE CONSTRAINT TRIGGER trg_customer_keeps_location
  AFTER DELETE ON customer_locations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_customer_still_reachable();

CREATE CONSTRAINT TRIGGER trg_customer_keeps_phone
  AFTER DELETE ON customer_contacts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_customer_still_reachable();

-- --------------------------------------------------------------- convenience

-- Everything the rider screen needs in one row per contact.
CREATE VIEW v_customer_directory AS
SELECT c.id            AS customer_id,
       c.code,
       c.name          AS customer_name,
       c.kind,
       c.active,
       l.label         AS location_label,
       l.address_line,
       l.area,
       l.town,
       l.is_primary    AS primary_location,
       ct.name         AS contact_name,
       ct.phone,
       ct.role,
       ct.is_primary   AS primary_contact
  FROM customers c
  JOIN customer_locations l ON l.customer_id = c.id
  JOIN customer_contacts ct ON ct.customer_id = c.id;

COMMIT;
