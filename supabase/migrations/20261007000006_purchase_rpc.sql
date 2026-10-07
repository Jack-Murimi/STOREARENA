-- 0006 — the transactional RPCs.
--
-- Stock integration, from inspecting the live schema:
--
--   stock_movements is a real ledger (operation already permits 'PURCHASE', and
--   it carries unit_cost_ksh, reference, actor and idempotency_key).
--   inventory_positions holds the current quantity per (location, variant, state).
--   stock_lots is the FIFO queue the sales side draws from.
--
--   So a purchase writes all three, in one transaction, and links back to the
--   invoice through stock_movements.reference = the invoice id. A void or an
--   edit writes a COMPENSATING movement rather than altering history - the
--   ledger stays append-only, which is the whole point of having one.
--
--   stock_movements has hard CHECKs every writer must satisfy:
--     balance_after = balance_before + quantity
--     char_length(trim(actor)) >= 2, char_length(trim(reason)) >= 5
--     GAS  => state is set and custody is null
--     CYLINDER => custody is set and state is null
--
-- Two adaptations, both noted:
--   * Only 'refill' and 'new_cylinder' post stock. The ledger is cylinder-shaped
--     (state REFILL/EMPTY, custody BRANCH/DEPOT/...), so an accessory or a crate
--     of water has nowhere honest to go. Those lines are financial-only until a
--     general-goods ledger exists.
--   * purchase_invoice_lines.quantity is numeric(12,2) but stock quantities are
--     integer. Quantities are rounded, and a non-integer cylinder count is
--     rejected rather than silently truncated.

create or replace function public.post_purchase_stock(
  p_invoice_id  uuid,
  p_branch_id   text,
  p_product_id  text,
  p_type        text,
  p_quantity    numeric,
  p_unit_cost   numeric,
  p_purchased_on date,
  p_actor       text
) returns void
language plpgsql
security definer
set search_path = public
as $$
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
    ledger_kind, operation, channel, location_id, variant_id, state, custody,
    quantity, balance_before, balance_after, reason, reference, actor, unit_cost_ksh
  ) values (
    'GAS', 'PURCHASE', 'INTERNAL', p_branch_id, p_product_id, 'REFILL', null,
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
      ledger_kind, operation, channel, location_id, variant_id, state, custody,
      quantity, balance_before, balance_after, reason, reference, actor, unit_cost_ksh
    ) values (
      'CYLINDER', 'PURCHASE', 'INTERNAL', p_branch_id, p_product_id, null, 'BRANCH',
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
$$;

-- Undo the stock effect of an invoice. Compensating movements, not edits.
create or replace function public.reverse_purchase_stock(p_invoice_id uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_bal integer;
begin
  for r in
    select l.product_id, l.purchase_type, l.quantity, l.unit_cost, i.branch_id, i.invoice_date
      from public.purchase_invoice_lines l
      join public.purchase_invoices i on i.id = l.invoice_id
     where l.invoice_id = p_invoice_id
  loop
    if r.purchase_type not in ('refill','new_cylinder') then continue; end if;

    select coalesce(remaining,0) into v_bal
      from public.stock_lots
     where reference = p_invoice_id::text
       and variant_id = r.product_id
       and location_id = r.branch_id;
    if coalesce(v_bal,0) < r.quantity then
      raise exception 'cannot reverse invoice %: % unit(s) of % have already been sold',
        p_invoice_id, r.quantity, r.product_id;
    end if;

    -- Draw the lot back down first, so FIFO stays honest.
    update public.stock_lots
       set remaining = remaining - r.quantity::integer
     where reference = p_invoice_id::text and variant_id = r.product_id
       and location_id = r.branch_id;

    -- Compensating movements, written directly. The posting helper cannot be
    -- reused with a negative quantity: it would insert a stock_lots row, and
    -- that table rejects quantity <= 0.
    select coalesce(quantity,0) into v_bal
      from public.inventory_positions
     where location_id = r.branch_id and variant_id = r.product_id and state = 'REFILL';
    v_bal := coalesce(v_bal, 0);
    if v_bal < r.quantity then
      raise exception 'cannot reverse invoice %: branch % holds only % unit(s)',
        p_invoice_id, r.branch_id, v_bal;
    end if;

    insert into public.stock_movements (
      ledger_kind, operation, channel, location_id, variant_id, state, custody,
      quantity, balance_before, balance_after, reason, reference, actor, unit_cost_ksh
    ) values (
      'GAS', 'PURCHASE', 'INTERNAL', r.branch_id, r.product_id, 'REFILL', null,
      -r.quantity::integer, v_bal, v_bal - r.quantity::integer,
      'reverse purchase ' || p_invoice_id::text, p_invoice_id::text,
      p_actor, r.unit_cost
    );

    update public.inventory_positions
       set quantity = quantity - r.quantity::integer, updated_at = now()
     where location_id = r.branch_id and variant_id = r.product_id and state = 'REFILL';

    if r.purchase_type = 'new_cylinder' then
      select coalesce(quantity,0) into v_bal
        from public.cylinder_custody
       where location_id = r.branch_id and variant_id = r.product_id and custody = 'BRANCH';
      v_bal := coalesce(v_bal, 0);

      insert into public.stock_movements (
        ledger_kind, operation, channel, location_id, variant_id, state, custody,
        quantity, balance_before, balance_after, reason, reference, actor, unit_cost_ksh
      ) values (
        'CYLINDER', 'PURCHASE', 'INTERNAL', r.branch_id, r.product_id, null, 'BRANCH',
        -r.quantity::integer, v_bal, v_bal - r.quantity::integer,
        'reverse purchase ' || p_invoice_id::text, p_invoice_id::text,
        p_actor, r.unit_cost
      );

      update public.cylinder_custody
         set quantity = quantity - r.quantity::integer
       where location_id = r.branch_id and variant_id = r.product_id and custody = 'BRANCH';
    end if;
  end loop;
end;
$$;
