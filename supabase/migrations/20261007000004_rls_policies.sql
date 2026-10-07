-- 0004 — row level security for the purchases module.
--
-- READ THIS BEFORE ASSUMING IT PROTECTS ANYTHING.
--
-- These policies are enforced only for a connection acting as `anon` or
-- `authenticated`. The application currently connects with DATABASE_URL as the
-- `postgres` role, which has BYPASSRLS = true and skips every policy here.
-- The policies become live when the app is switched to the Supabase client
-- with the anon key plus a user session (Phase 2). Until then they are correct
-- SQL that guards nothing, and SECURITY.md says so plainly.

alter table public.suppliers             enable row level security;
alter table public.purchase_invoices     enable row level security;
alter table public.purchase_invoice_lines enable row level security;
alter table public.supplier_payments     enable row level security;
alter table public.supplier_price_quotes enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on
  public.suppliers, public.purchase_invoices, public.purchase_invoice_lines,
  public.supplier_payments, public.supplier_price_quotes
  to authenticated;
-- No role may delete anything in this module.
revoke delete on
  public.suppliers, public.purchase_invoices, public.purchase_invoice_lines,
  public.supplier_payments, public.supplier_price_quotes
  from authenticated, anon;

-- ---- suppliers -------------------------------------------------------------
-- Everyone signed in can read the supplier list (attendants need it to raise an
-- invoice). Balances come from a separate view they cannot see.
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select to authenticated using (true);

drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers
  for insert to authenticated
  with check (public.current_app_role() in ('manager','admin','director'));

drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers
  for update to authenticated
  using (public.current_app_role() in ('manager','admin','director'))
  with check (public.current_app_role() in ('manager','admin','director'));

-- ---- purchase_invoices -----------------------------------------------------
-- An attendant sees only invoices they raised in their own branch. A manager
-- sees the whole branch. Admin and director see everything.
drop policy if exists invoices_select on public.purchase_invoices;
create policy invoices_select on public.purchase_invoices
  for select to authenticated
  using (
    public.is_admin_or_director()
    or (
      public.current_app_role() = 'manager'
      and branch_id = public.current_branch_id()
    )
    or (
      public.current_app_role() = 'attendant'
      and branch_id = public.current_branch_id()
      and created_by = auth.uid()
    )
  );

drop policy if exists invoices_insert on public.purchase_invoices;
create policy invoices_insert on public.purchase_invoices
  for insert to authenticated
  with check (
    public.is_admin_or_director()
    or (
      public.current_app_role() in ('attendant','manager')
      and branch_id = public.current_branch_id()
    )
  );

-- UPDATE is deliberately absent for attendant and manager. Posted records may
-- only be changed through update_purchase_invoice(), which checks the role,
-- the version and the reason. A direct UPDATE policy would be a second door.
drop policy if exists invoices_update on public.purchase_invoices;
create policy invoices_update on public.purchase_invoices
  for update to authenticated
  using (public.is_admin_or_director())
  with check (public.is_admin_or_director());

-- ---- purchase_invoice_lines ------------------------------------------------
-- Lines follow their invoice: the same reader set, and no independent update.
drop policy if exists lines_select on public.purchase_invoice_lines;
create policy lines_select on public.purchase_invoice_lines
  for select to authenticated
  using (exists (
    select 1 from public.purchase_invoices i
     where i.id = invoice_id
       and (
         public.is_admin_or_director()
         or (public.current_app_role() = 'manager' and i.branch_id = public.current_branch_id())
         or (public.current_app_role() = 'attendant'
             and i.branch_id = public.current_branch_id()
             and i.created_by = auth.uid())
       )
  ));

drop policy if exists lines_insert on public.purchase_invoice_lines;
create policy lines_insert on public.purchase_invoice_lines
  for insert to authenticated
  with check (exists (
    select 1 from public.purchase_invoices i
     where i.id = invoice_id
       and (
         public.is_admin_or_director()
         or (public.current_app_role() in ('attendant','manager')
             and i.branch_id = public.current_branch_id())
       )
  ));

drop policy if exists lines_update on public.purchase_invoice_lines;
create policy lines_update on public.purchase_invoice_lines
  for update to authenticated
  using (public.is_admin_or_director())
  with check (public.is_admin_or_director());

-- ---- supplier_payments -----------------------------------------------------
-- Attendants neither record nor see payments: the brief keeps balances away
-- from them, and a payment list is a balance list.
drop policy if exists payments_select on public.supplier_payments;
create policy payments_select on public.supplier_payments
  for select to authenticated
  using (
    public.is_admin_or_director()
    or (public.current_app_role() = 'manager' and branch_id = public.current_branch_id())
  );

drop policy if exists payments_insert on public.supplier_payments;
create policy payments_insert on public.supplier_payments
  for insert to authenticated
  with check (
    public.is_admin_or_director()
    or (public.current_app_role() = 'manager' and branch_id = public.current_branch_id())
  );

drop policy if exists payments_update on public.supplier_payments;
create policy payments_update on public.supplier_payments
  for update to authenticated
  using (public.is_admin_or_director())
  with check (public.is_admin_or_director());

-- ---- supplier_price_quotes -------------------------------------------------
-- Price data is a negotiating advantage. Attendants do not see it.
drop policy if exists quotes_select on public.supplier_price_quotes;
create policy quotes_select on public.supplier_price_quotes
  for select to authenticated
  using (public.current_app_role() in ('manager','admin','director'));

drop policy if exists quotes_write on public.supplier_price_quotes;
create policy quotes_write on public.supplier_price_quotes
  for insert to authenticated
  with check (public.current_app_role() in ('manager','admin','director'));

drop policy if exists quotes_update on public.supplier_price_quotes;
create policy quotes_update on public.supplier_price_quotes
  for update to authenticated
  using (public.current_app_role() in ('manager','admin','director'))
  with check (public.current_app_role() in ('manager','admin','director'));
