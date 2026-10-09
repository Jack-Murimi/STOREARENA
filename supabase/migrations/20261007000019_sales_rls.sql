-- SALES MODULE: row level security.
--
-- Enforcement lives here, not in the UI. The app connects as postgres, which
-- has BYPASSRLS, so it is unaffected - these policies bind the authenticated
-- role once Supabase Auth is live.
--
-- Column-level hiding of cost_at_sale cannot be done with RLS, which is
-- row-level only, and cannot be done with GRANT either, because attendant and
-- director are values in app_users.role rather than separate database roles.
-- So attendants and riders get a view that omits the column entirely.

alter table public.sales         enable row level security;
alter table public.sale_lines    enable row level security;
alter table public.sale_payments enable row level security;
alter table public.riders        enable row level security;

alter table public.sales         force row level security;
alter table public.sale_lines    force row level security;
alter table public.sale_payments force row level security;
alter table public.riders        force row level security;

-- Direct writes are refused for everyone but the RPCs. There is deliberately
-- no INSERT or UPDATE policy: money and stock move only through create_sale
-- and void_sale.
revoke insert, update, delete on public.sales         from anon, authenticated;
revoke insert, update, delete on public.sale_lines    from anon, authenticated;
revoke insert, update, delete on public.sale_payments from anon, authenticated;
revoke insert, update, delete on public.riders        from anon, authenticated;

-- A rider with a login sees only the sales they delivered. Everyone else at
-- the branch sees the branch. Admin and director see everything.
create or replace function public.can_read_sale(p_branch text, p_rider uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin_or_director() then true
    when p_rider is not null and p_rider in (
           select r.user_id from public.riders r
            where r.user_id = auth.uid() and r.user_id is not null
         ) then true
    else public.user_has_branch(p_branch)
  end;
$$;

drop policy if exists sales_read_own_scope on public.sales;
create policy sales_read_own_scope on public.sales
  for select to authenticated
  using (public.can_read_sale(branch_id, rider_id));

drop policy if exists sale_lines_read_own_scope on public.sale_lines;
create policy sale_lines_read_own_scope on public.sale_lines
  for select to authenticated
  using (exists (
    select 1 from public.sales s
     where s.id = sale_lines.sale_id
       and public.can_read_sale(s.branch_id, s.rider_id)
  ));

drop policy if exists sale_payments_read_own_scope on public.sale_payments;
create policy sale_payments_read_own_scope on public.sale_payments
  for select to authenticated
  using (exists (
    select 1 from public.sales s
     where s.id = sale_payments.sale_id
       and public.can_read_sale(s.branch_id, s.rider_id)
  ));

drop policy if exists riders_read_own_branch on public.riders;
create policy riders_read_own_branch on public.riders
  for select to authenticated
  using (public.is_admin_or_director() or public.user_has_branch(branch_id));

grant select on public.sales, public.sale_lines, public.sale_payments, public.riders to authenticated;

-- The cost-free projection. Attendants and riders read this; it has no
-- cost_at_sale column at all, so there is nothing to leak.
create or replace view public.v_sale_lines_public with (security_invoker = true) as
select l.id, l.sale_id, l.variant_id, l.line_type, l.quantity,
       l.list_price, l.unit_price, l.discount_amount, l.line_total,
       l.empties_returned, l.empty_brand_id
  from public.sale_lines l;

grant select on public.v_sale_lines_public to authenticated;

-- The view was not enough. Granting SELECT on sale_lines to authenticated
-- handed over every column including cost_at_sale, so an attendant could read
-- the base table and see cost directly - verified, it returned a row.
-- RLS is row-level and cannot hide a column, and GRANT cannot distinguish
-- attendant from director because those are values in app_users.role, not
-- database roles. So cost_at_sale is revoked from authenticated outright.
-- Server-side margin reporting runs as postgres, or through a definer RPC.
revoke select (cost_at_sale) on public.sale_lines from anon, authenticated;
