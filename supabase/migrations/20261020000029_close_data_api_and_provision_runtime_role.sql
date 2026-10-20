-- ============================================================================
-- 0029 — close the Data API, force RLS on every table, provision portal_app
-- ============================================================================
--
-- WHY THIS EXISTS
--
-- The portal talks to PostgreSQL directly (DATABASE_URL) and uses Supabase only
-- for Auth: there is not one `.from()` or `.rpc()` call in the application. The
-- `public` schema was nevertheless still reachable over the Data API
-- (https://<ref>.supabase.co/rest/v1/...) with the publishable key, which ships
-- in the browser bundle. Three problems followed from that:
--
--   1. `post_purchase_stock` is SECURITY DEFINER, performs no role check at
--      all, and carried PUBLIC EXECUTE. Anyone holding the publishable key -
--      no login - could POST to /rest/v1/rpc/post_purchase_stock and insert
--      stock movements, inflate inventory_positions and create stock_lots at a
--      cost of their choosing, on any branch, with a forged `actor`.
--   2. Twenty-one functions were executable by `anon` for the same reason:
--      PUBLIC EXECUTE is granted by default on functions in this schema.
--   3. `supplier_payment_allocations` had RLS disabled entirely, so the moment
--      any client role gained a grant on it, it was readable and writable with
--      no policy at all.
--
-- WHAT THIS DOES
--
--   * Revokes every privilege on the `public` schema from `anon` and
--     `authenticated`. The Data API is not part of this application's
--     architecture; if it is ever wanted, re-granting is a deliberate step.
--   * Revokes EXECUTE from PUBLIC on every function, which is what closes the
--     unauthenticated RPC path.
--   * Enables *and forces* row level security on all 31 tables, so a future
--     grant is deny-by-default rather than accidentally open.
--   * Creates `portal_app`: a NOLOGIN-until-you-set-a-password role with no
--     BYPASSRLS, no DDL and no DELETE, so the portal can be moved off the
--     `postgres` owner connection (see SECURITY.md).
--
-- The application itself keeps working unchanged: it connects as `postgres`,
-- the owner of every object here, which retains all privileges.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- 1. clients
-- No client role gets anything in `public`. Rows, sequences and functions.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- PUBLIC EXECUTE is the default on every function and is what let an
-- unauthenticated caller reach the SECURITY DEFINER routines. Remove it, then
-- grant back only the read-only helpers that RLS policies call.
revoke execute on all functions in schema public from public;

-- New objects must not inherit the old openness either.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;

-- Anon has no business resolving objects in this schema at all.
revoke usage on schema public from anon;

-- The policy helpers are SECURITY DEFINER, read `auth.uid()` only, and cannot
-- change anything. Keeping them executable means the `authenticated` policies
-- already written in earlier migrations stay valid if the Data API is reopened.
grant execute on function public.current_app_user()          to authenticated;
grant execute on function public.current_app_role()          to authenticated;
grant execute on function public.current_branch_id()         to authenticated;
grant execute on function public.is_admin_or_director()      to authenticated;
grant execute on function public.user_has_branch(text)       to authenticated;
grant execute on function public.can_read_sale(text, uuid)   to authenticated;

-- ------------------------------------------------------------- 2. force RLS
-- ENABLE turns policies on; FORCE makes them apply to the table owner too, so
-- an object owned by a future non-BYPASSRLS role cannot quietly skip its own
-- policies. (`postgres` here has BYPASSRLS, which is the remaining gap that
-- portal_app exists to close.)
do $$
declare
  r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
     order by c.relname
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    execute format('alter table public.%I force row level security', r.relname);
  end loop;
end;
$$;

-- ---------------------------------------------------------- 3. portal_app
-- The connection the portal should use instead of `postgres`. It cannot log in
-- until a password is set (see SECURITY.md), so creating it changes nothing on
-- its own; it removes the excuse to stay on a BYPASSRLS role.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'portal_app') then
    create role portal_app login password null
      nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;
end;
$$;

grant usage on schema public to portal_app;
grant select, insert, update on all tables in schema public to portal_app;
grant usage, select on all sequences in schema public to portal_app;
grant execute on all functions in schema public to portal_app;

-- Two ledgers are append-only by design. The application never updates them;
-- withholding the privilege means a bug cannot rewrite history either.
revoke all on public.audit_log from portal_app;
grant select on public.audit_log to portal_app;
revoke update on public.stock_movements from portal_app;

-- There is no DELETE grant anywhere: customers are deactivated, sales and
-- purchase records are voided, stock movements are appended. The triggers that
-- enforce this stay as the second line.

-- Coarse policies for the runtime role. They are deliberately `using (true)`:
-- portal_app is server-side code that already applies per-user rules in
-- src/lib/access-policy.ts, and the database cannot know which staff member is
-- acting because the app does not pass an identity per query. What this buys is
-- real enforcement of the *boundaries* - no DELETE, no DDL, no auth schema, no
-- ledger rewrites - instead of the bypass-everything owner connection.
do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
     order by c.relname
  loop
    execute format('drop policy if exists portal_app_read on public.%I', t.relname);
    execute format(
      'create policy portal_app_read on public.%I for select to portal_app using (true)',
      t.relname
    );

    if t.relname <> 'audit_log' then
      execute format('drop policy if exists portal_app_write on public.%I', t.relname);
      execute format(
        'create policy portal_app_write on public.%I for insert to portal_app with check (true)',
        t.relname
      );
    end if;

    if t.relname not in ('audit_log', 'stock_movements') then
      execute format('drop policy if exists portal_app_change on public.%I', t.relname);
      execute format(
        'create policy portal_app_change on public.%I for update to portal_app using (true) with check (true)',
        t.relname
      );
    end if;
  end loop;
end;
$$;

commit;
