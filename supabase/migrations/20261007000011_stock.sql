-- STEP 3 — stock: branch-scoped reads, and no cost data below manager.
--
-- An attendant needs to know what is on the shelf in their branch. They do not
-- need to know what it cost, and margin is not their business. So the quantity
-- views are open to them and every view carrying a price is manager+ only,
-- with attendant-safe replacements that omit the cost columns entirely rather
-- than nulling them - a column that exists can be selected by a future query
-- someone forgets to guard.
--
-- stock_movements is immutable for everyone. A ledger you can edit is not a
-- ledger. Corrections are reversing movements, which is what the purchases
-- module does on void and on edit.

grant select, insert on public.inventory_positions, public.stock_lots,
  public.stock_movements, public.cylinder_custody to authenticated;
revoke update, delete, truncate, references, trigger
  on public.inventory_positions, public.stock_lots,
     public.stock_movements, public.cylinder_custody
  from authenticated;

-- The ledger is append-only for every role, enforced twice: no UPDATE/DELETE
-- grant above, and a trigger below so a superuser-ish path still cannot edit
-- history by accident.
create or replace function public.block_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'stock_movements is an immutable ledger - post a reversing movement instead of % this row',
    tg_op;
end;
$$;

drop trigger if exists stock_movements_no_update on public.stock_movements;
create trigger stock_movements_no_update
  before update on public.stock_movements
  for each row execute function public.block_ledger_mutation();

drop trigger if exists stock_movements_no_delete on public.stock_movements;
create trigger stock_movements_no_delete
  before delete on public.stock_movements
  for each row execute function public.block_ledger_mutation();

-- ---- reads -----------------------------------------------------------------
-- Quantities: your own branch, or every branch if you are admin/director.
drop policy if exists positions_select on public.inventory_positions;
create policy positions_select on public.inventory_positions
  for select to authenticated
  using ((select public.is_admin_or_director())
         or (select public.user_has_branch(location_id)));

drop policy if exists custody_select on public.cylinder_custody;
create policy custody_select on public.cylinder_custody
  for select to authenticated
  using ((select public.is_admin_or_director())
         or (select public.user_has_branch(location_id)));

-- Lots carry a unit cost, so the table itself is manager+ only. Attendants get
-- the cost-free view below instead.
drop policy if exists lots_select on public.stock_lots;
create policy lots_select on public.stock_lots
  for select to authenticated
  using (((select public.is_admin_or_director())
          or (select public.current_app_role()) = 'manager')
         and ((select public.is_admin_or_director())
              or (select public.user_has_branch(location_id))));

drop policy if exists movements_select on public.stock_movements;
create policy movements_select on public.stock_movements
  for select to authenticated
  using ((select public.is_admin_or_director())
         or (select public.user_has_branch(location_id)));

-- ---- writes ----------------------------------------------------------------
-- Inserts are branch-scoped for now. These grants are revoked again once the
-- receive_stock / record_sale RPCs land, which is the end state.
drop policy if exists positions_insert on public.inventory_positions;
create policy positions_insert on public.inventory_positions
  for insert to authenticated
  with check ((select public.user_has_branch(location_id)));

drop policy if exists movements_insert on public.stock_movements;
create policy movements_insert on public.stock_movements
  for insert to authenticated
  with check ((select public.user_has_branch(location_id)));

-- No UPDATE policy exists for any stock table, and no DELETE policy exists.

-- ---- attendant-safe views: quantities, never prices ------------------------
create or replace view public.v_stock_on_hand
with (security_invoker = true) as
select p.location_id, p.variant_id, p.state, p.quantity, p.updated_at
from public.inventory_positions p;

create or replace view public.v_cylinder_counts_safe
with (security_invoker = true) as
select location_id, variant_id, custody, quantity
from public.cylinder_custody;

grant select on public.v_stock_on_hand, public.v_cylinder_counts_safe to authenticated;

-- ---- the priced views are manager+ only ------------------------------------
-- Recreated as security_invoker so they stop running as their definer and
-- bypassing the policies on the tables below them.
create or replace view public.v_stock_cost
with (security_invoker = true) as
select
  l.location_id,
  l.variant_id,
  sum(l.remaining * l.unit_cost_ksh)                    as cost_on_hand_ksh,
  sum(l.remaining)                                      as units_costed,
  max(l.unit_cost_ksh) filter (
    where l.purchased_on = (select max(l2.purchased_on) from public.stock_lots l2
                             where l2.location_id = l.location_id
                               and l2.variant_id = l.variant_id)) as last_purchase_ksh,
  max(l.purchased_on)                                   as last_purchased_on
from public.stock_lots l
where l.remaining > 0
group by l.location_id, l.variant_id;

grant select on public.v_stock_cost to authenticated;
revoke select on public.v_stock_cost from anon;

-- Reading it still requires SELECT on stock_lots, which the policy above
-- restricts to manager+. The view is not the gate; the table policy is.

create index if not exists inventory_positions_location_idx on public.inventory_positions (location_id);
create index if not exists stock_lots_location_idx on public.stock_lots (location_id, variant_id);
create index if not exists stock_movements_location_idx on public.stock_movements (location_id, occurred_at desc);
create index if not exists cylinder_custody_location_idx on public.cylinder_custody (location_id);
