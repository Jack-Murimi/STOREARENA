-- STEP 2 — customers: read for all, insert for all, update for manager+.
--
-- Decisions this implements:
--   * Option (a): customers are shared across branches (there is no branch_id
--     on customers), so every signed-in user reads every customer.
--   * An attendant may INSERT a customer - they meet new ones at sale time -
--     but may not UPDATE one. Correcting a record is a manager's act.
--   * Audit triggers on all three tables, so "who changed this address" has an
--     answer.
--   * The balance is hidden from attendants in the directory view.
--
-- The existing v_customer_directory used INNER joins on locations and contacts.
-- Those are kept as-is deliberately: switching to LEFT would start returning
-- customers who have no contact, which is a behaviour change to a view four
-- screens already read.

grant select, insert, update on public.customers,
  public.customer_locations, public.customer_contacts to authenticated;
revoke delete, truncate, references, trigger
  on public.customers, public.customer_locations, public.customer_contacts
  from authenticated;

-- Read: any signed-in user, all branches.
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated using ((select auth.uid()) is not null);

-- Insert: any signed-in user, including an attendant.
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert to authenticated with check ((select auth.uid()) is not null);

-- Update: manager and above only. This is the line between recording a new
-- customer at the counter and editing someone's history.
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update to authenticated
  using ((select public.current_app_role()) in ('manager','admin','director'))
  with check ((select public.current_app_role()) in ('manager','admin','director'));

-- Locations and contacts follow the same rule, and follow their customer.
drop policy if exists custloc_select on public.customer_locations;
create policy custloc_select on public.customer_locations
  for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists custloc_insert on public.customer_locations;
create policy custloc_insert on public.customer_locations
  for insert to authenticated with check ((select auth.uid()) is not null);
drop policy if exists custloc_update on public.customer_locations;
create policy custloc_update on public.customer_locations
  for update to authenticated
  using ((select public.current_app_role()) in ('manager','admin','director'))
  with check ((select public.current_app_role()) in ('manager','admin','director'));

drop policy if exists custcon_select on public.customer_contacts;
create policy custcon_select on public.customer_contacts
  for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists custcon_insert on public.customer_contacts;
create policy custcon_insert on public.customer_contacts
  for insert to authenticated with check ((select auth.uid()) is not null);
drop policy if exists custcon_update on public.customer_contacts;
create policy custcon_update on public.customer_contacts
  for update to authenticated
  using ((select public.current_app_role()) in ('manager','admin','director'))
  with check ((select public.current_app_role()) in ('manager','admin','director'));

-- Audit. Phone numbers and addresses are the fields people argue about later.
drop trigger if exists customers_audit on public.customers;
create trigger customers_audit
  after insert or update or delete on public.customers
  for each row execute function public.audit_trigger_fn();

drop trigger if exists customer_locations_audit on public.customer_locations;
create trigger customer_locations_audit
  after insert or update or delete on public.customer_locations
  for each row execute function public.audit_trigger_fn();

drop trigger if exists customer_contacts_audit on public.customer_contacts;
create trigger customer_contacts_audit
  after insert or update or delete on public.customer_contacts
  for each row execute function public.audit_trigger_fn();

-- Recreated with security_invoker = true, so the caller's own RLS applies to
-- the tables underneath instead of the view's definer sailing through them.
-- The balance is joined but nulled out for anyone below manager, so an
-- attendant sees the customer and not what they owe.
create or replace view public.v_customer_directory
with (security_invoker = true) as
select
  c.id            as customer_id,
  c.code,
  c.name          as customer_name,
  c.kind,
  c.active,
  l.label         as location_label,
  l.address_line,
  l.details,
  l.area,
  l.town,
  l.pin_lat,
  l.pin_lng,
  l.is_primary    as primary_location,
  ct.name         as contact_name,
  ct.phone,
  ct.role,
  ct.is_primary   as primary_contact,
  case
    when (select public.current_app_role()) in ('manager','admin','director')
      then coalesce(b.balance, 0)
    else null
  end             as balance
from public.customers c
join public.customer_locations l on l.customer_id = c.id
join public.customer_contacts ct on ct.customer_id = c.id
left join lateral (
  select coalesce(sum(i2.total) filter (where not i2.cancelled), 0)
       - coalesce((select sum(p2.amount) from public.payments p2
                    where p2.customer_id = c.id), 0) as balance
    from public.invoices i2
   where i2.customer_id = c.id
) b on true;

grant select on public.v_customer_directory to authenticated;

create index if not exists customer_locations_customer_idx on public.customer_locations (customer_id);
create index if not exists customer_contacts_customer_idx on public.customer_contacts (customer_id);
create index if not exists customer_contacts_phone_idx on public.customer_contacts (phone);
