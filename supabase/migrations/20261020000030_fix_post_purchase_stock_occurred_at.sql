-- ============================================================================
-- 0030 — fix post_purchase_stock, and let portal_app read the JWT helpers
-- ============================================================================
--
-- 1. post_purchase_stock inserted a CYLINDER row into stock_movements without
--    `occurred_at`, which is NOT NULL with no default. Every purchase receipt
--    that brought new cylinders in therefore failed with
--        23502: null value in column "occurred_at" of relation "stock_movements"
--    AFTER the GAS row had already been written in the same transaction, so the
--    whole invoice rolled back and no stock arrived. Found by calling the
--    function as the runtime role rather than by reading it.
--
--    The GAS insert passes now() explicitly; the CYLINDER insert now does too,
--    which is the behaviour the rest of the ledger expects (recorded_at already
--    defaults to now()).
--
-- 2. portal_app needs USAGE on the `auth` schema to resolve auth.uid() and
--    friends, exactly as `authenticated` does. The SECURITY DEFINER routines
--    resolve it as their owner, but a direct call from server code would not.
-- ============================================================================

begin;

grant usage on schema auth to portal_app;

create or replace function public.post_purchase_stock(
  p_invoice_id   uuid,
  p_branch_id    text,
  p_product_id   text,
  p_type         text,
  p_quantity     numeric,
  p_unit_cost    numeric,
  p_purchased_on date,
  p_actor        text
) returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_bal_refill integer;
  v_bal_cyl    integer;
  v_qty        integer;
  v_reason     text := 'purchase ' || p_invoice_id::text;
begin
  if p_type not in ('refill','new_cylinder') then
    return;  -- financial-only line, see the header note
  end if;
  if p_quantity <> trunc(p_quantity) then
    raise exception 'cylinder quantities must be whole numbers (got %)', p_quantity;
  end if;
  v_qty := p_quantity::integer;

  select coalesce(quantity,0) into v_bal_refill
    from public.inventory_positions
   where location_id = p_branch_id and variant_id = p_product_id and state = 'REFILL';
  v_bal_refill := coalesce(v_bal_refill, 0);

  -- A refill tops up gas in cylinders we already own. A new cylinder brings a
  -- cylinder with it, so it also moves custody.
  insert into public.stock_movements (
    ledger_kind, operation, channel, occurred_at, location_id, variant_id, state, custody,
    quantity, balance_before, balance_after, reason, reference, actor, unit_cost_ksh
  ) values (
    'GAS', 'PURCHASE', 'INTERNAL', now(), p_branch_id, p_product_id, 'REFILL', null,
    v_qty, v_bal_refill, v_bal_refill + v_qty, v_reason, p_invoice_id::text,
    p_actor, p_unit_cost
  );

  insert into public.inventory_positions (location_id, variant_id, state, quantity)
  values (p_branch_id, p_product_id, 'REFILL', v_bal_refill + v_qty)
  on conflict (location_id, variant_id, state)
  do update set quantity = excluded.quantity, updated_at = now();

  if p_type = 'new_cylinder' then
    -- Cylinder counts live in cylinder_custody. inventory_positions only holds
    -- gas states (REFILL|EMPTY) and its CHECK would reject a 'CYLINDER' row,
    -- so the custody table is the only correct place to read this balance.
    select coalesce(quantity,0) into v_bal_cyl
      from public.cylinder_custody
     where location_id = p_branch_id and variant_id = p_product_id and custody = 'BRANCH';
    v_bal_cyl := coalesce(v_bal_cyl, 0);

    insert into public.stock_movements (
      ledger_kind, operation, channel, occurred_at, location_id, variant_id, state, custody,
      quantity, balance_before, balance_after, reason, reference, actor, unit_cost_ksh
    ) values (
      'CYLINDER', 'PURCHASE', 'INTERNAL', now(), p_branch_id, p_product_id, null, 'BRANCH',
      v_qty, v_bal_cyl, v_bal_cyl + v_qty, v_reason, p_invoice_id::text,
      p_actor, p_unit_cost
    );

    insert into public.cylinder_custody (location_id, variant_id, custody, quantity)
    values (p_branch_id, p_product_id, 'BRANCH', v_qty)
    on conflict (location_id, variant_id, custody)
    do update set quantity = public.cylinder_custody.quantity + excluded.quantity;
  end if;

  -- The FIFO queue the sales side consumes from.
  insert into public.stock_lots (
    location_id, variant_id, purchased_on, unit_cost_ksh, quantity, remaining, reference
  ) values (
    p_branch_id, p_product_id, p_purchased_on, p_unit_cost, v_qty, v_qty,
    p_invoice_id::text
  );
end;
$function$;

-- CREATE OR REPLACE keeps the existing grants, but state them so a re-run from
-- scratch lands in the same place: this routine is server-side only.
revoke execute on function public.post_purchase_stock(uuid, text, text, text, numeric, numeric, date, text) from public, anon, authenticated;
grant execute on function public.post_purchase_stock(uuid, text, text, text, numeric, numeric, date, text) to portal_app;

commit;
