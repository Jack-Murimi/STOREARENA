-- SALES MODULE, phase 1b: the RPCs.
--
-- Everything money- or stock-related happens in here, inside one transaction.
-- The browser sends product ids, quantities and any requested price or
-- discount; it never sends a total. Every price, availability check and total
-- is computed server-side from the catalogue and the FIFO lots.
--
-- Cost is snapshotted per line into sale_lines.cost_at_sale and is never
-- returned to the caller. Error messages never contain the floor price or the
-- cost - an attendant is told "Price below the allowed minimum" and nothing
-- more.

create or replace function public.create_sale(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_user       record;
  v_role       text;
  v_branch     text;
  v_stock_loc  text;
  v_sale_id    uuid;
  v_sale_date  timestamptz;
  v_sale_type  text := coalesce(p_payload ->> 'sale_type', 'counter');
  v_rider_id   uuid := nullif(p_payload ->> 'rider_id', '')::uuid;
  v_customer   text := nullif(p_payload ->> 'customer_id', '');
  v_cust_loc   text := nullif(p_payload ->> 'customer_location_id', '');
  v_receipt    text := trim(coalesce(p_payload ->> 'receipt_no', ''));
  v_idem       uuid := nullif(p_payload ->> 'idempotency_key', '')::uuid;
  v_credit_due date := nullif(p_payload ->> 'credit_due_date', '')::date;
  v_confirm_big boolean := coalesce((p_payload ->> 'confirm_large_quantity')::boolean, false);
  v_actor      text;

  v_line       jsonb;
  v_variant    record;
  v_type       text;
  v_qty        integer;
  v_list       numeric(14,2);
  v_unit       numeric(14,2);
  v_discount   numeric(14,2);
  v_line_total numeric(14,2);
  v_empties    integer;
  v_empty_brand text;

  v_bal_full   numeric;
  v_bal_empty  numeric;
  v_lot        record;
  v_need       integer;
  v_take       integer;
  v_cost       numeric(14,2) := 0;
  v_lot_cost   numeric;
  v_avail      integer;

  v_subtotal   numeric(14,2) := 0;
  v_discount_t numeric(14,2) := 0;
  v_total      numeric(14,2) := 0;
  v_paid       numeric(14,2) := 0;
  v_due        numeric(14,2) := 0;
  v_pay        jsonb;
  v_reason     text;
  v_dup        uuid;
  v_rider_active boolean;
  v_rider_branch text;
begin
  -- ------------------------------------------------------------ identity ----
  if v_uid is null then
    raise exception using message = 'not_signed_in', errcode = '28000';
  end if;

  -- app_users.id already references auth.users(id), so no join is needed.
  -- The display name is full_name, not name.
  select u.id, u.full_name, u.role, u.is_active
    into v_user
    from public.app_users u
   where u.id = v_uid;

  if v_user.id is null or not v_user.is_active then
    raise exception using message = 'account_inactive', errcode = '28000';
  end if;

  v_role  := v_user.role;
  v_actor := coalesce(v_user.full_name, 'staff');

  -- ------------------------------------------------------------ branch ------
  v_branch := nullif(p_payload ->> 'branch_id', '');
  if v_branch is null then
    select b.branch_id into v_branch from public.user_branches b where b.user_id = v_uid limit 1;
  elsif not public.user_has_branch(v_branch) and not public.is_admin_or_director() then
    raise exception using message = 'no_access_to_branch', errcode = '42501';
  end if;

  if v_branch is null then
    raise exception using message = 'branch_required', errcode = '22023';
  end if;

  -- --------------------------------------------------------- idempotency ----
  -- A double tap or a retried request returns the sale already created for
  -- this key rather than selling the same cylinders twice.
  if v_idem is not null then
    select id into v_dup from public.sales where idempotency_key = v_idem;
    if v_dup is not null then
      return v_dup;
    end if;
  else
    raise exception using message = 'idempotency_key_required', errcode = '22023';
  end if;

  -- ------------------------------------------------------------ header ------
  if v_receipt = '' then
    raise exception using message = 'receipt_no_required', errcode = '22023';
  end if;

  select id into v_dup from public.sales
   where branch_id = v_branch and receipt_no = v_receipt;
  if v_dup is not null then
    raise exception
      using message = format('receipt_no_taken:%s', v_dup), errcode = '23505';
  end if;

  v_sale_date := coalesce((p_payload ->> 'sale_date')::timestamptz, now());

  if v_sale_date > now() then
    raise exception using message = 'sale_date_in_future', errcode = '22023';
  end if;

  if v_sale_date < now() - interval '7 days' then
    raise exception using message = 'backdate_over_seven_days', errcode = '22023';
  end if;

  if v_sale_date < now() - interval '10 minutes'
     and v_role not in ('manager','admin','director') then
    raise exception using message = 'backdate_needs_manager', errcode = '42501';
  end if;

  if v_sale_type = 'delivery' then
    if v_rider_id is null or v_cust_loc is null then
      raise exception using message = 'delivery_needs_rider_and_location', errcode = '22023';
    end if;
    select r.is_active, r.branch_id into v_rider_active, v_rider_branch
      from public.riders r where r.id = v_rider_id;

    if v_rider_branch is null then
      raise exception using message = 'rider_not_found', errcode = '22023';
    end if;
    if v_rider_active is distinct from true then
      raise exception using message = 'rider_inactive', errcode = '22023';
    end if;
    if v_rider_branch <> v_branch then
      raise exception using message = 'rider_wrong_branch', errcode = '42501';
    end if;
  end if;

  -- Riders do not hold stock. Only the four branches do, so both counter and
  -- delivery sales draw from the branch store. Nothing leaves stock when a
  -- rider drives out - only when the delivery is completed and the sale is
  -- recorded here.
  v_stock_loc := v_branch;

  -- -------------------------------------------------------------- lines -----
  if jsonb_array_length(coalesce(p_payload -> 'lines', '[]'::jsonb)) = 0 then
    raise exception using message = 'no_lines', errcode = '22023';
  end if;

  -- The sale row is created first so the lines have something to hang off. The
  -- totals are corrected once the lines are known; the CHECK constraints on
  -- sales are only satisfied at the end of this block.
  insert into public.sales (
    id, branch_id, sale_date, sale_type, receipt_no, customer_id,
    customer_location_id, rider_id, stock_location_id, user_id,
    idempotency_key, status, subtotal, discount_total, total, amount_paid,
    balance_due, credit_due_date, notes
  ) values (
    gen_random_uuid(), v_branch, v_sale_date, v_sale_type, v_receipt, v_customer,
    v_cust_loc, v_rider_id, v_stock_loc, v_uid,
    v_idem, 'posted', 0, 0, 0, 0, 0, v_credit_due, p_payload ->> 'notes'
  ) returning id into v_sale_id;

  for v_line in select * from jsonb_array_elements(p_payload -> 'lines')
  loop
    v_type := coalesce(v_line ->> 'line_type', 'other');
    v_qty  := coalesce((v_line ->> 'quantity')::integer, 0);

    if v_qty <= 0 then
      raise exception using message = 'quantity_must_be_positive', errcode = '22023';
    end if;

    if v_qty > 20 and not v_confirm_big then
      raise exception
        using message = format('large_quantity_needs_confirmation:%s', v_qty),
              errcode = '22023';
    end if;

    select pv.id, pv.name, pv.list_price_ksh, pv.min_price, pv.max_discount_percent
      into v_variant
      from public.product_variants pv
     where pv.id = v_line ->> 'variant_id';

    if v_variant.id is null then
      raise exception using message = 'variant_not_found', errcode = '22023';
    end if;

    v_list := coalesce(v_variant.list_price_ksh, 0);

    -- The client may ask for a price. It is a request, never an instruction:
    -- it is only honoured if it clears the floor, and the floor is never
    -- quoted back in the error.
    v_unit := coalesce(nullif(v_line ->> 'unit_price', '')::numeric(14,2), v_list);

    if v_unit < v_list and v_variant.min_price is null then
      -- No floor is configured for this variant, so discounting is not
      -- permitted on it at all.
      raise exception
        using message = format('no_price_floor_set:%s', v_variant.name),
              errcode = '42501';
    end if;

    if v_unit < coalesce(v_variant.min_price, v_list) then
      if v_role not in ('admin','director') then
        raise exception
          using message = 'price_below_allowed_minimum', errcode = '42501';
      elsif nullif(trim(coalesce(v_line ->> 'price_override_reason','')), '') is null then
        raise exception
          using message = 'override_needs_reason', errcode = '22023';
      end if;
    end if;

    v_discount := coalesce((v_line ->> 'discount_amount')::numeric(14,2), 0);
    if v_discount < 0 then
      raise exception using message = 'discount_cannot_be_negative', errcode = '22023';
    end if;

    if v_role = 'attendant' and v_discount > 0 then
      raise exception using message = 'attendant_cannot_discount', errcode = '42501';
    end if;

    if v_list > 0 and v_discount > v_list * v_qty * v_variant.max_discount_percent / 100 then
      raise exception
        using message = format('discount_exceeds_limit:%s', v_variant.name),
              errcode = '42501';
    end if;

    v_line_total := (v_qty * v_unit) - v_discount;

    v_empties     := coalesce((v_line ->> 'empties_returned')::integer, 0);
    v_empty_brand := nullif(v_line ->> 'empty_brand_id', '');

    if v_type = 'refill' then
      v_empties := coalesce(nullif(v_line ->> 'empties_returned', '')::integer, v_qty);
      if v_empty_brand is null then
        raise exception using message = 'refill_needs_empty_brand', errcode = '22023';
      end if;
    end if;

    -- ---------------------------------------------------- stock and FIFO ----
    v_cost := 0;

    if v_type in ('refill','new_cylinder') then
      -- Lock this product's position row before reading the balance, so two
      -- attendants selling the last cylinder cannot both pass the check.
      select coalesce(quantity,0) into v_bal_full
        from public.inventory_positions
       where location_id = v_stock_loc and variant_id = v_variant.id
         and state = 'REFILL'
       for update;

      v_avail := coalesce(v_bal_full, 0)::integer;

      if v_qty > v_avail then
        raise exception
          using message = format('only_n_left:%s:%s', v_avail, v_variant.name),
                errcode = '22023';
      end if;

      -- Consume oldest first, taking from as many lots as needed, and carry
      -- the cost of what was actually taken.
      v_need := v_qty;
      for v_lot in
        select id, remaining, unit_cost_ksh
          from public.stock_lots
         where location_id = v_stock_loc and variant_id = v_variant.id
           and remaining > 0
         order by purchased_on, id
         for update
      loop
        exit when v_need <= 0;
        v_take := least(v_lot.remaining::integer, v_need);
        update public.stock_lots set remaining = remaining - v_take where id = v_lot.id;
        v_cost := v_cost + (v_take * coalesce(v_lot.unit_cost_ksh, 0));
        v_need := v_need - v_take;
      end loop;

      if v_need > 0 then
        -- Positions and lots disagree. Fail loudly rather than sell stock
        -- that has no cost behind it.
        raise exception using message = 'stock_ledger_inconsistent', errcode = 'XX000';
      end if;

      update public.inventory_positions
         set quantity = quantity - v_qty, updated_at = now()
       where location_id = v_stock_loc and variant_id = v_variant.id and state = 'REFILL';

      insert into public.stock_movements (
        ledger_kind, operation, channel, occurred_at, location_id, variant_id,
        state, custody, quantity, balance_before, balance_after, reason,
        reference, actor, unit_cost_ksh, idempotency_key
      ) values (
        'GAS', case when v_type = 'new_cylinder' then 'NEW_CYLINDER_SALE' else 'REFILL_SALE' end,
        case when v_sale_type = 'delivery' then 'DELIVERY' else 'WALK_IN' end,
        now(), v_stock_loc, v_variant.id, 'REFILL', null,
        -v_qty, v_bal_full, v_bal_full - v_qty,
        'sale ' || v_receipt, v_sale_id::text, v_actor,
        case when v_qty > 0 then v_cost / v_qty else 0 end, v_idem
      );
    end if;

    -- Empties coming back are stock, and the customer keeps the cylinder.
    if v_empties > 0 then
      insert into public.inventory_positions (location_id, variant_id, state, quantity)
      values (v_stock_loc, v_variant.id, 'EMPTY', v_empties)
      on conflict (location_id, variant_id, state)
      do update set quantity = inventory_positions.quantity + excluded.quantity,
                    updated_at = now();

      insert into public.stock_movements (
        ledger_kind, operation, channel, occurred_at, location_id, variant_id,
        state, custody, quantity, balance_before, balance_after, reason,
        reference, actor, idempotency_key
      )
      -- CYLINDER rows carry custody and no state; GAS rows are the reverse.
      select 'CYLINDER', 'EMPTY_RETURN',
             case when v_sale_type = 'delivery' then 'DELIVERY' else 'WALK_IN' end,
             now(), v_stock_loc, v_variant.id, null, 'BRANCH',
             v_empties, coalesce(ip.quantity,0) - v_empties, ip.quantity,
             'empties returned on ' || v_receipt, v_sale_id::text, v_actor, v_idem
        from public.inventory_positions ip
       where ip.location_id = v_stock_loc and ip.variant_id = v_variant.id
         and ip.state = 'EMPTY';

      if v_type = 'new_cylinder' then
        -- A complete gas: the cylinder itself leaves the branch and goes to
        -- the customer. No deposit is charged; custody records where it is.
        update public.cylinder_custody
           set quantity = greatest(quantity - v_qty, 0), updated_at = now()
         where location_id = v_stock_loc and variant_id = v_variant.id
           and custody = 'BRANCH';

        insert into public.cylinder_custody (location_id, variant_id, custody, quantity)
        values (v_stock_loc, v_variant.id, 'CUSTOMER', v_qty)
        on conflict (location_id, variant_id, custody)
        do update set quantity = cylinder_custody.quantity + excluded.quantity,
                      updated_at = now();
      end if;
    end if;

    -- line_total is a GENERATED column in the legacy schema, so it is not
    -- inserted; the database derives it from quantity * unit_price.
    insert into public.sale_lines (
      id, sale_id, variant_id, line_type, quantity, list_price, unit_price,
      discount_amount, empties_returned, empty_brand_id,
      cost_at_sale, price_override_reason, discount_reason, override_approved_by
    ) values (
      gen_random_uuid()::text, v_sale_id, v_variant.id, v_type, v_qty, v_list, v_unit,
      v_discount, v_empties, v_empty_brand,
      v_cost, nullif(trim(coalesce(v_line ->> 'price_override_reason','')), ''),
      -- The legacy price_deviation_needs_reason check fires on ANY deviation
      -- from list price, up or down, and reads discount_reason. A new cylinder
      -- is always priced above the refill list price, so without this every
      -- new-cylinder sale would demand a reason nobody has to give.
      coalesce(
        nullif(trim(coalesce(v_line ->> 'price_override_reason','')), ''),
        case when v_type = 'new_cylinder' and v_unit > v_list
             then 'new cylinder sold with gas' end
      ),
      case when v_unit < coalesce(v_variant.min_price, v_list) then v_uid else null end
    );

    v_subtotal   := v_subtotal + (v_qty * v_unit);
    v_discount_t := v_discount_t + v_discount;
  end loop;

  v_total := v_subtotal - v_discount_t;

  -- ----------------------------------------------------------- payments -----
  for v_pay in select * from jsonb_array_elements(coalesce(p_payload -> 'payments', '[]'::jsonb))
  loop
    if coalesce((v_pay ->> 'amount')::numeric(14,2), 0) <= 0 then
      raise exception using message = 'payment_amount_must_be_positive', errcode = '22023';
    end if;

    if v_pay ->> 'method' in ('mpesa','bank','card')
       and nullif(trim(coalesce(v_pay ->> 'reference','')), '') is null then
      raise exception using message = 'payment_reference_required', errcode = '22023';
    end if;

    v_paid := v_paid + (v_pay ->> 'amount')::numeric(14,2);
  end loop;

  v_due := v_total - v_paid;

  if v_due < 0 then
    raise exception using message = 'overpaid', errcode = '22023';
  end if;

  if v_due > 0 then
    if v_customer is null then
      raise exception using message = 'credit_needs_customer', errcode = '22023';
    end if;

    if v_credit_due is null then
      v_credit_due := current_date + 3;
    end if;

    -- Respect the customer's credit limit, counting what they already owe.
    declare
      v_owed numeric(14,2);
      v_limit numeric(14,2);
    begin
      select coalesce(sum(balance_due),0) into v_owed
        from public.sales
       where customer_id = v_customer and status = 'posted' and id <> v_sale_id;
      select credit_limit_ksh into v_limit from public.customers where id = v_customer;

      if coalesce(v_limit,0) > 0 and v_owed + v_due > v_limit then
        raise exception using message = 'customer_credit_limit_exceeded', errcode = '42501';
      end if;
    end;
  end if;

  if v_paid > v_total then
    raise exception using message = 'payments_exceed_total', errcode = '22023';
  end if;

  for v_pay in select * from jsonb_array_elements(coalesce(p_payload -> 'payments', '[]'::jsonb))
  loop
    insert into public.sale_payments (sale_id, method, amount, reference, created_by)
    values (v_sale_id, v_pay ->> 'method', (v_pay ->> 'amount')::numeric(14,2),
            nullif(trim(coalesce(v_pay ->> 'reference','')), ''), v_uid);
  end loop;

  -- Totals are written last, once the CHECK constraints can be satisfied.
  update public.sales
     set subtotal = v_subtotal, discount_total = v_discount_t, total = v_total,
         amount_paid = v_paid, balance_due = v_due, credit_due_date = v_credit_due
   where id = v_sale_id;

  return v_sale_id;
end;
$$;

revoke all on function public.create_sale(jsonb) from public;
grant execute on function public.create_sale(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Voiding reverses the stock effect by writing reversing movements, then marks
-- the sale void with a reason. Nothing is deleted and no line is removed, so
-- the audit trail stays intact.
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
      update public.inventory_positions
         set quantity = greatest(quantity - v_line.empties_returned, 0), updated_at = now()
       where location_id = v_sale.stock_location_id and variant_id = v_line.variant_id
         and state = 'EMPTY';
    end if;
  end loop;

  update public.sales
     set status = 'void', void_reason = p_reason, updated_by = v_uid, version = version + 1
   where id = p_sale_id;
end;
$$;

revoke all on function public.void_sale(uuid, text) from public;
grant execute on function public.void_sale(uuid, text) to authenticated;
