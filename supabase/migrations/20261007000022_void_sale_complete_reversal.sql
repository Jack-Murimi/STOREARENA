-- Complete void reversals for the sales ledger.
-- A void never deletes: it writes equal and opposite stock/custody movements.

create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  text;
  v_sale  record;
  v_line  record;
  v_bal   numeric;
  v_actor text;
begin
  if v_uid is null then
    raise exception using message = 'not_signed_in', errcode = '28000';
  end if;

  select role, full_name into v_role, v_actor from public.app_users where id = v_uid;
  v_actor := coalesce(v_actor, 'staff');

  if v_role not in ('admin','director') then
    raise exception using message = 'void_needs_admin_or_director', errcode = '42501';
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception using message = 'reason_too_short', errcode = '22023';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale.id is null then
    raise exception using message = 'sale_not_found', errcode = '22023';
  end if;
  if v_sale.status = 'void' then
    raise exception using message = 'already_void', errcode = '22023';
  end if;

  for v_line in
    select * from public.sale_lines where sale_id = p_sale_id
  loop
    if v_line.line_type in ('refill','new_cylinder') then
      -- Put the gas back. Lots are not reconstructed - the sale may have
      -- drawn from several - so the reversal is recorded against the position
      -- and a fresh lot is created at the cost that was snapshotted.
      select coalesce(quantity,0) into v_bal
        from public.inventory_positions
       where location_id = v_sale.stock_location_id and variant_id = v_line.variant_id
         and state = 'REFILL'
       for update;

      update public.inventory_positions
         set quantity = quantity + v_line.quantity, updated_at = now()
       where location_id = v_sale.stock_location_id and variant_id = v_line.variant_id
         and state = 'REFILL';

      insert into public.stock_movements (
        ledger_kind, operation, channel, occurred_at, location_id, variant_id,
        state, custody, quantity, balance_before, balance_after, reason,
        reference, actor, unit_cost_ksh
      ) values (
        'GAS', case when v_line.line_type = 'new_cylinder' then 'NEW_CYLINDER_SALE' else 'REFILL_SALE' end,
        'INTERNAL', now(), v_sale.stock_location_id, v_line.variant_id,
        'REFILL', null, v_line.quantity, coalesce(v_bal,0), coalesce(v_bal,0) + v_line.quantity,
        'void of sale ' || v_sale.receipt_no || ': ' || p_reason,
        v_sale.id::text, v_actor,
        case when v_line.quantity > 0 then coalesce(v_line.cost_at_sale,0) / v_line.quantity else 0 end
      );

      insert into public.stock_lots (
        location_id, variant_id, purchased_on, unit_cost_ksh, quantity, remaining, reference
      ) values (
        v_sale.stock_location_id, v_line.variant_id, current_date,
        case when v_line.quantity > 0 then coalesce(v_line.cost_at_sale,0) / v_line.quantity else 0 end,
        v_line.quantity, v_line.quantity, 'void:' || v_sale.id::text
      );
    end if;

    if v_line.empties_returned > 0 then
      -- Reverse the returned empty as a ledger movement too. The old function
      -- changed the position but left the immutable movement ledger one-sided.
      select coalesce(quantity,0) into v_bal
        from public.inventory_positions
       where location_id = v_sale.stock_location_id and variant_id = v_line.variant_id
         and state = 'EMPTY'
       for update;

      update public.inventory_positions
         set quantity = greatest(quantity - v_line.empties_returned, 0), updated_at = now()
       where location_id = v_sale.stock_location_id and variant_id = v_line.variant_id
         and state = 'EMPTY';

      insert into public.stock_movements (
        ledger_kind, operation, channel, occurred_at, location_id, variant_id,
        state, custody, quantity, balance_before, balance_after, reason,
        reference, actor
      ) values (
        'CYLINDER', 'EMPTY_RETURN', 'INTERNAL', now(),
        v_sale.stock_location_id, v_line.variant_id, null, 'BRANCH',
        -v_line.empties_returned, coalesce(v_bal,0),
        greatest(coalesce(v_bal,0) - v_line.empties_returned, 0),
        'void of empty return on sale ' || v_sale.receipt_no || ': ' || p_reason,
        v_sale.id::text, v_actor
      );
    end if;

    if v_line.line_type = 'new_cylinder' then
      -- A complete-gas sale moves a cylinder to the customer. Undo that
      -- custody movement as well as the gas, otherwise every void leaks a
      -- cylinder out of branch custody.
      select coalesce(quantity,0) into v_bal
        from public.cylinder_custody
       where location_id = v_sale.stock_location_id and variant_id = v_line.variant_id
         and custody = 'BRANCH'
       for update;

      insert into public.cylinder_custody (location_id, variant_id, custody, quantity)
      values (v_sale.stock_location_id, v_line.variant_id, 'BRANCH', v_line.quantity)
      on conflict (location_id, variant_id, custody)
      do update set quantity = cylinder_custody.quantity + excluded.quantity,
                    updated_at = now();

      update public.cylinder_custody
         set quantity = greatest(quantity - v_line.quantity, 0), updated_at = now()
       where location_id = v_sale.stock_location_id and variant_id = v_line.variant_id
         and custody = 'CUSTOMER';

      insert into public.stock_movements (
        ledger_kind, operation, channel, occurred_at, location_id, variant_id,
        state, custody, quantity, balance_before, balance_after, reason,
        reference, actor
      ) values (
        'CYLINDER', 'NEW_CYLINDER_SALE', 'INTERNAL', now(),
        v_sale.stock_location_id, v_line.variant_id, null, 'BRANCH',
        v_line.quantity, coalesce(v_bal,0), coalesce(v_bal,0) + v_line.quantity,
        'void of new cylinder sale ' || v_sale.receipt_no || ': ' || p_reason,
        v_sale.id::text, v_actor
      );
    end if;
  end loop;

  update public.sales
     set status = 'void', void_reason = p_reason, updated_by = v_uid, version = version + 1
   where id = p_sale_id;
end;
$$;


revoke all on function public.void_sale(uuid, text) from public;
grant execute on function public.void_sale(uuid, text) to authenticated;
