-- Catalogue names are business identifiers, not free-form labels. Store the
-- displayed forms consistently and keep case-only duplicates out of the
-- database even if a writer bypasses the application.
--
-- This migration deliberately does not touch prices, stock, sales, FIFO lots,
-- RLS, or branch structure.

BEGIN;

UPDATE public.categories
   SET name = upper(btrim(name))
 WHERE name IS DISTINCT FROM upper(btrim(name));

UPDATE public.brands
   SET name = upper(btrim(name)),
       depot_name = upper(btrim(depot_name))
 WHERE name IS DISTINCT FROM upper(btrim(name))
    OR depot_name IS DISTINCT FROM upper(btrim(depot_name));

UPDATE public.product_variants
   SET name = upper(btrim(name))
 WHERE name IS DISTINCT FROM upper(btrim(name));

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_normalized_name
  ON public.categories ((upper(btrim(name))));

CREATE UNIQUE INDEX IF NOT EXISTS uq_brands_normalized_name
  ON public.brands ((upper(btrim(name))));

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variants_normalized_name
  ON public.product_variants
     (brand_id, category_id, (upper(btrim(name))));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_name_is_uppercase') THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_name_is_uppercase
      CHECK (name = upper(btrim(name)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brands_name_is_uppercase') THEN
    ALTER TABLE public.brands
      ADD CONSTRAINT brands_name_is_uppercase
      CHECK (name = upper(btrim(name)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_variants_name_is_uppercase') THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_name_is_uppercase
      CHECK (name = upper(btrim(name)));
  END IF;
END
$$;

COMMIT;
