-- STEP 0 — close the open grants. Apply this before anything else.
--
-- WHAT WAS FOUND ON THE LIVE DATABASE:
--   All 23 public tables and views carry DELETE, INSERT, REFERENCES, SELECT,
--   TRIGGER, TRUNCATE and UPDATE grants to `anon`, and RLS is disabled on every
--   one of them. The anon key is not a secret - it is designed to ship in
--   client code - so as things stand anyone holding it can read, alter and
--   delete every customer, invoice, payment and stock row over the REST API
--   without signing in.
--
-- WHY THIS IS SAFE TO APPLY FIRST:
--   The application connects as `postgres`, which has BYPASSRLS = true. It
--   skips RLS entirely, so enabling RLS with no policies changes nothing for
--   the running app - every page keeps working. What it does change is that
--   the `anon` and `authenticated` roles stop having unrestricted access.
--   That makes this the one migration that can go in immediately and alone.
--
-- RLS with no policies means deny-all. Policies are added in later steps, per
-- table, in the order agreed in docs/RLS_PLAN.md.

-- ---- 1. stop new tables inheriting the open grants -------------------------
-- The current default privileges in `public` grant anon and authenticated
-- everything on every table created from now on. Undo that first, or every
-- later migration reopens the hole.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

-- ---- 2. deny anon everything, everywhere ----------------------------------
do $$
declare r record;
begin
  for r in select tablename as name from pg_tables where schemaname = 'public'
  loop
    execute format('revoke all on table public.%I from anon', r.name);
  end loop;
  for r in select viewname as name from pg_views where schemaname = 'public'
  loop
    execute format('revoke all on public.%I from anon', r.name);
  end loop;
end $$;

-- ---- 3. strip authenticated back to nothing for now -----------------------
-- Later steps grant exactly what each policy needs. TRUNCATE, REFERENCES and
-- TRIGGER are never granted to an application role.
do $$
declare r record;
begin
  for r in select tablename as name from pg_tables where schemaname = 'public'
  loop
    execute format('revoke all on table public.%I from authenticated', r.name);
  end loop;
  for r in select viewname as name from pg_views where schemaname = 'public'
  loop
    execute format('revoke all on public.%I from authenticated', r.name);
  end loop;
end $$;

-- ---- 4. enable RLS on every public table ----------------------------------
-- No policies yet, so this is deny-all for anon and authenticated and a no-op
-- for the postgres role the app still uses.
do $$
declare r record;
begin
  for r in select c.relname
             from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    -- Force RLS even for a table owner that is not a superuser, so a future
    -- role change cannot quietly switch enforcement off.
    execute format('alter table public.%I force row level security', r.relname);
  end loop;
end $$;

-- ---- 5. sales and sale_lines: deny-all, explicitly ------------------------
-- Nothing in the application reads or writes these two tables today (the
-- dashboard uses sample data from src/lib/data.ts). They stay closed until a
-- sales module owns them.
revoke all on public.sales, public.sale_lines from anon, authenticated;

-- ---- 6. views -------------------------------------------------------------
-- A view runs as its definer, so RLS on the tables underneath does not apply to
-- it. Grants were revoked above, which closes them for now. Converting each to
-- security_invoker = true needs its current definition and is a separate,
-- reviewed step - doing it here blind would risk changing what a view returns.
