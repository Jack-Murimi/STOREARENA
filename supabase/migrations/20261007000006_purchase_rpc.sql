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

-- ---- the transactional entry points ----------------------------------------
-- Every write goes through one of these. They are SECURITY DEFINER because
-- direct write grants on the tables are revoked: the role and branch checks
-- happen here, once, in the same transaction as the write.

create or replace function public.create_purchase_invoice(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text := public.current_app_role();
  v_branch    text := p_payload ->> 'branch_id';
  v_invoice   uuid;
  v_line      jsonb;
  v_subtotal  numeric(14,2) := 0;
  v_vat       numeric(14,2) := 0;
  v_vat_rate  numeric := coalesce((p_payload ->> 'vat_rate')::numeric, 0);
  v_actor     text  := coalesce(nullif(btrim(p_payload ->> 'actor'), ''), 'system');
begin
  if v_role is null then
    raise exception 'not signed in or account inactive';
  end if;
  if v_role in ('attendant','manager') then
    if not public.user_has_branch(v_branch) then
      raise exception 'you may not raise an invoice for branch %', v_branch;
    end if;
  end if;
  if v_branch is null then
    raise exception 'branch_id is required';
  end if;
  if coalesce(jsonb_array_length(p_payload -> 'lines'), 0) = 0 then
    raise exception 'an invoice needs at least one line';
  end if;

  -- Totals are computed here, never trusted from the client. The table CHECK
  -- (total = subtotal + vat_amount) makes a disagreement impossible to store.
  for v_line in select * from jsonb_array_elements(p_payload -> 'lines')
  loop
    v_subtotal := v_subtotal + round(
      (v_line ->> 'quantity')::numeric * (v_line ->> 'unit_cost')::numeric, 2);
  end loop;
  v_vat := round(v_subtotal * v_vat_rate / 100, 2);

  begin
    insert into public.purchase_invoices (
      supplier_id, branch_id, invoice_no, invoice_date, due_date,
      status, subtotal, vat_amount, total, notes, attachment_path, created_by
    ) values (
      (p_payload ->> 'supplier_id')::uuid, v_branch, p_payload ->> 'invoice_no',
      coalesce((p_payload ->> 'invoice_date')::date, current_date),
      (p_payload ->> 'due_date')::date,
      coalesce(p_payload ->> 'status', 'posted'),
      v_subtotal, v_vat, v_subtotal + v_vat,
      p_payload ->> 'notes', p_payload ->> 'attachment_path', auth.uid()
    )
    -- The unique constraint is the real duplicate guard; this just gives a
    -- better message than a constraint-violation stack.
    on conflict on constraint purchase_invoices_supplier_no_unique
    do nothing;
  exception when others then
    raise exception 'could not save the invoice: %', sqlerrm;
  end;

  select id into v_invoice from public.purchase_invoices
   where supplier_id = (p_payload ->> 'supplier_id')::uuid
     and invoice_no  = p_payload ->> 'invoice_no';

  if v_invoice is null then
    raise exception 'supplier % already has an invoice numbered %',
      p_payload ->> 'supplier_id', p_payload ->> 'invoice_no';
  end if;

  for v_line in select * from jsonb_array_elements(p_payload -> 'lines')
  loop
    insert into public.purchase_invoice_lines (
      invoice_id, product_id, purchase_type, quantity, unit_cost
    ) values (
      v_invoice, v_line ->> 'product_id', v_line ->> 'purchase_type',
      (v_line ->> 'quantity')::numeric, (v_line ->> 'unit_cost')::numeric
    );

    perform public.post_purchase_stock(
      v_invoice, v_branch, v_line ->> 'product_id', v_line ->> 'purchase_type',
      (v_line ->> 'quantity')::numeric, (v_line ->> 'unit_cost')::numeric,
      coalesce((p_payload ->> 'invoice_date')::date, current_date), v_actor);
  end loop;

  return v_invoice;
end;
$$;

create or replace function public.void_purchase_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_admin_or_director() then
    raise exception 'only an admin or director may void an invoice';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'a reason of at least 10 characters is required to void';
  end if;

  select status into v_status from public.purchase_invoices where id = p_invoice_id;
  if v_status is null then raise exception 'invoice % not found', p_invoice_id; end if;
  if v_status = 'void' then raise exception 'invoice % is already void', p_invoice_id; end if;

  perform set_config('app.change_reason', btrim(p_reason), true);

  -- Stock comes back out before the status flips, so a failure leaves both
  -- sides untouched rather than half-reversed.
  perform public.reverse_purchase_stock(p_invoice_id,
    coalesce((select email::text from public.current_app_user()), 'system'));

  update public.purchase_invoices
     set status = 'void', void_reason = btrim(p_reason)
   where id = p_invoice_id;
end;
$$;

create or replace function public.update_purchase_invoice(
  p_invoice_id       uuid,
  p_expected_version integer,
  p_payload          jsonb,
  p_reason           text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current  public.purchase_invoices;
  v_subtotal numeric(14,2) := 0;
  v_vat      numeric(14,2) := 0;
  v_line     jsonb;
  v_actor    text := coalesce((select email::text from public.current_app_user()), 'system');
begin
  if not public.is_admin_or_director() then
    raise exception 'only an admin or director may edit an invoice';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'a reason of at least 10 characters is required to edit a posted invoice';
  end if;

  select * into v_current from public.purchase_invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice % not found', p_invoice_id; end if;

  -- Optimistic concurrency. Without this, two admins editing the same invoice
  -- each save over the other and only the second one's reason is recorded.
  if v_current.version <> p_expected_version then
    raise exception 'version conflict: this invoice is now at version %, you were editing %',
      v_current.version, p_expected_version
      using errcode = '40001';
  end if;
  if v_current.status = 'void' then
    raise exception 'a void invoice cannot be edited';
  end if;

  perform set_config('app.change_reason', btrim(p_reason), true);

  -- Undo the old stock effect, then reapply the new one, in this transaction.
  perform public.reverse_purchase_stock(p_invoice_id, v_actor);
  delete from public.purchase_invoice_lines where invoice_id = p_invoice_id;

  for v_line in select * from jsonb_array_elements(p_payload -> 'lines')
  loop
    v_subtotal := v_subtotal + round(
      (v_line ->> 'quantity')::numeric * (v_line ->> 'unit_cost')::numeric, 2);
  end loop;
  v_vat := round(v_subtotal * coalesce((p_payload ->> 'vat_rate')::numeric, 0) / 100, 2);

  for v_line in select * from jsonb_array_elements(p_payload -> 'lines')
  loop
    insert into public.purchase_invoice_lines (
      invoice_id, product_id, purchase_type, quantity, unit_cost
    ) values (
      p_invoice_id, v_line ->> 'product_id', v_line ->> 'purchase_type',
      (v_line ->> 'quantity')::numeric, (v_line ->> 'unit_cost')::numeric
    );
    perform public.post_purchase_stock(
      p_invoice_id, v_current.branch_id, v_line ->> 'product_id',
      v_line ->> 'purchase_type', (v_line ->> 'quantity')::numeric,
      (v_line ->> 'unit_cost')::numeric, v_current.invoice_date, v_actor);
  end loop;

  update public.purchase_invoices
     set subtotal = v_subtotal, vat_amount = v_vat, total = v_subtotal + v_vat,
         due_date = coalesce((p_payload ->> 'due_date')::date, due_date),
         notes    = coalesce(p_payload ->> 'notes', notes)
   where id = p_invoice_id;

  -- The BEFORE UPDATE trigger bumps version and stamps updated_by.
  return v_current.version + 1;
end;
$$;

create or replace function public.void_supplier_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_or_director() then
    raise exception 'only an admin or director may void a payment';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'a reason of at least 10 characters is required to void a payment';
  end if;

  perform set_config('app.change_reason', btrim(p_reason), true);

  update public.supplier_payments
     set status = 'void', void_reason = btrim(p_reason)
   where id = p_payment_id and status = 'posted';

  if not found then
    raise exception 'payment % not found or already void', p_payment_id;
  end if;
end;
$$;

revoke all on function public.create_purchase_invoice(jsonb) from anon;
revoke all on function public.update_purchase_invoice(uuid, integer, jsonb, text) from anon;
revoke all on function public.void_purchase_invoice(uuid, text) from anon;
revoke all on function public.void_supplier_payment(uuid, text) from anon;
