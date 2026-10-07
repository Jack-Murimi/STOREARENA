-- STEP 1 — reference data: the catalogue and the branch list.
--
-- Lowest-risk tables, so they go first and prove the pattern before anything
-- sensitive is touched. Read for every signed-in user (an attendant cannot
-- record a sale without the catalogue), write for manager and above.
--
-- No deletes. Deactivating a brand or a branch preserves the history that
-- references it; deleting one would orphan every invoice line pointing at it.

-- categories, brands, product_variants, stock_locations
do $$
declare t text;
begin
  foreach t in array array['categories','brands','product_variants','stock_locations']
  loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant insert, update on public.%I to authenticated', t);
    execute format('revoke delete, truncate, references, trigger on public.%I from authenticated', t);
  end loop;
end $$;

-- Sequences behind the identity/serial columns need USAGE or an INSERT fails
-- with a permission error that looks like a bug in the app.
do $$
declare r record;
begin
  for r in select s.relname
             from pg_class s
             join pg_depend d on d.objid = s.oid
             join pg_class t on t.oid = d.refobjid
             join pg_namespace n on n.oid = t.relnamespace
            where s.relkind = 'S' and n.nspname = 'public'
              and t.relname in ('categories','brands','product_variants','stock_locations')
  loop
    execute format('grant usage, select on sequence public.%I to authenticated', r.relname);
  end loop;
end $$;

-- Read: everyone signed in.
drop policy if exists ref_select on public.categories;
create policy ref_select on public.categories
  for select to authenticated using ((select auth.uid()) is not null);

drop policy if exists ref_select on public.brands;
create policy ref_select on public.brands
  for select to authenticated using ((select auth.uid()) is not null);

drop policy if exists ref_select on public.product_variants;
create policy ref_select on public.product_variants
  for select to authenticated using ((select auth.uid()) is not null);

drop policy if exists ref_select on public.stock_locations;
create policy ref_select on public.stock_locations
  for select to authenticated using ((select auth.uid()) is not null);

-- Write: manager and above. An attendant cannot add a branch or a product.
drop policy if exists ref_insert on public.categories;
create policy ref_insert on public.categories
  for insert to authenticated with check (
    (select public.current_app_role()) in ('manager','admin','director'));

drop policy if exists ref_insert on public.brands;
create policy ref_insert on public.brands
  for insert to authenticated with check (
    (select public.current_app_role()) in ('manager','admin','director'));

drop policy if exists ref_insert on public.product_variants;
create policy ref_insert on public.product_variants
  for insert to authenticated with check (
    (select public.current_app_role()) in ('manager','admin','director'));

drop policy if exists ref_insert on public.stock_locations;
create policy ref_insert on public.stock_locations
  for insert to authenticated with check (
    (select public.is_admin_or_director()));

drop policy if exists ref_update on public.categories;
create policy ref_update on public.categories
  for update to authenticated
  using ((select public.current_app_role()) in ('manager','admin','director'))
  with check ((select public.current_app_role()) in ('manager','admin','director'));

drop policy if exists ref_update on public.brands;
create policy ref_update on public.brands
  for update to authenticated
  using ((select public.current_app_role()) in ('manager','admin','director'))
  with check ((select public.current_app_role()) in ('manager','admin','director'));

drop policy if exists ref_update on public.product_variants;
create policy ref_update on public.product_variants
  for update to authenticated
  using ((select public.current_app_role()) in ('manager','admin','director'))
  with check ((select public.current_app_role()) in ('manager','admin','director'));

-- A branch is where money and stock are attributed. Only admin/director.
drop policy if exists ref_update on public.stock_locations;
create policy ref_update on public.stock_locations
  for update to authenticated
  using ((select public.is_admin_or_director()))
  with check ((select public.is_admin_or_director()));

-- Every branch_id used in a policy is indexed, so a scoped query does not scan.
create index if not exists product_variants_category_idx on public.product_variants (category_id);
create index if not exists stock_locations_home_idx on public.stock_locations (home_location_id);
