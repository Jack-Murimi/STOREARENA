-- ============================================================================
-- 0032 — add product_variants.reorder_level to the deployed database
-- ============================================================================
--
-- `src/lib/stock/schema.sql` — the schema the test suite runs against — has
-- carried `reorder_level` since the stock service was written, and
-- `StockLedgerService.stockRows()` selects it, but no migration ever added the
-- column to the deployed database. Every inventory read therefore failed:
--
--     ERROR: 42703: column v.reorder_level does not exist
--
-- The dashboard wrapped its call in try/catch and quietly rendered an empty
-- stock table; the inventory list and the item page did not, so they threw
-- after their loading skeleton had already been streamed — and the skeleton
-- stayed on screen indefinitely. That is what "clicking a product never loads"
-- was.
--
-- Checked against information_schema on 2026-10-20: this was the only column
-- the portal's stock queries read that the deployed database did not have.
--
-- 10 is the value the test schema and the product form have always used: below
-- ten filled cylinders of a product, the dashboard raises a reorder alert.
-- 0 means "never alert", which is what accessories want.

alter table public.product_variants
  add column if not exists reorder_level integer not null default 10;

-- Dropped first so the migration is safe to run against a database where the
-- column (and constraint) was added by hand, or where a previous run stopped
-- half way.
alter table public.product_variants
  drop constraint if exists product_variants_reorder_level_check;

alter table public.product_variants
  add constraint product_variants_reorder_level_check check (reorder_level >= 0);

comment on column public.product_variants.reorder_level is
  'Filled cylinders below which the dashboard raises a reorder alert. 0 disables the alert.';
