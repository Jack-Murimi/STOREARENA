-- INTER-BRANCH STOCK TRANSFERS
--
-- Two workflows are intentionally distinct:
--   STOCK_MOVE       refills and/or empties move from source to destination.
--   REFILL_EXCHANGE  source sends refills; destination returns any available
--                    empty shells. A short empty return remains in destination
--                    branch custody rather than being invented or written off.
--
-- This migration does not change prices, FIFO lots, sales, riders, or RLS on
-- existing stock tables. The only stock writes happen in the atomic function
-- below and are recorded in the existing append-only stock_movements ledger.

create sequence if not exists public.stock_transfer_number_seq start with 1;

create table if not exists public.stock_transfers (
  id              uuid primary key default gen_random_uuid(),
  transfer_no     text not null unique default (
                    'TRF-' || lpad(nextval('public.stock_transfer_number_seq')::text, 6, '0')
                  ),
  workflow        text not null check (workflow in ('STOCK_MOVE', 'REFILL_EXCHANGE')),
  from_branch_id  text not null references public.stock_locations(id),
  to_branch_id    text not null references public.stock_locations(id),
  delivery_note   text,
  notes           text,
  occurred_at     timestamptz not null default now(),
  actor           text not null check (char_length(trim(actor)) >= 2),
  created_by      uuid references auth.users(id),
  idempotency_key uuid not null unique,
  created_at      timestamptz not null default now(),
  constraint stock_transfers_different_branches check (from_branch_id <> to_branch_id),
  constraint stock_transfers_note_length check (notes is null or char_length(trim(notes)) >= 3)
);

create table if not exists public.stock_transfer_lines (
  id                       bigint generated always as identity primary key,
  transfer_id              uuid not null references public.stock_transfers(id) on delete restrict,
  variant_id               text not null references public.product_variants(id),
  refills_sent             integer not null default 0 check (refills_sent >= 0),
  empties_sent             integer not null default 0 check (empties_sent >= 0),
  empties_returned         integer not null default 0 check (empties_returned >= 0),
  constraint stock_transfer_lines_one_variant unique (transfer_id, variant_id),
  constraint stock_transfer_lines_some_quantity check (refills_sent + empties_sent + empties_returned > 0)
);

create index if not exists stock_transfers_date_idx on public.stock_transfers (occurred_at desc);
create index if not exists stock_transfers_from_idx on public.stock_transfers (from_branch_id, occurred_at desc);
create index if not exists stock_transfers_to_idx on public.stock_transfers (to_branch_id, occurred_at desc);

alter table public.stock_transfers enable row level security;
alter table public.stock_transfers force row level security;
alter table public.stock_transfer_lines enable row level security;
alter table public.stock_transfer_lines force row level security;
revoke all on public.stock_transfers, public.stock_transfer_lines from anon, authenticated;
drop policy if exists stock_transfers_staff_read on public.stock_transfers;
create policy stock_transfers_staff_read on public.stock_transfers for select to authenticated using (true);
drop policy if exists stock_transfer_lines_staff_read on public.stock_transfer_lines;
create policy stock_transfer_lines_staff_read on public.stock_transfer_lines for select to authenticated using (true);
grant select on public.stock_transfers, public.stock_transfer_lines to authenticated;

-- A source/destination/variant advisory lock serialises both positions before
-- calculating a before/after ledger balance. This prevents two parallel forms
-- from both spending the same cylinder or producing a false audit balance.
create or replace function public.create_stock_transfer(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id                uuid := gen_random_uuid();
  v_idem              uuid := coalesce(nullif(p_payload ->> 'idempotency_key', '')::uuid, gen_random_uuid());
  v_workflow          text := p_payload ->> 'workflow';
  v_from              text := nullif(p_payload ->> 'from_branch_id', '');
  v_to                text := nullif(p_payload ->> 'to_branch_id', '');
  v_note              text := nullif(trim(coalesce(p_payload ->> 'delivery_note', '')), '');
  v_notes             text := nullif(trim(coalesce(p_payload ->> 'notes', '')), '');
  v_actor             text := null;
  v_uid               uuid := auth.uid();
  v_transfer_no       text;
  v_line              jsonb;
  v_variant           text;
  v_refills           integer;
  v_empties_sent      integer;
  v_empties_returned  integer;
  v_from_refills      integer;
  v_to_refills        integer;
  v_from_empties      integer;
  v_to_empties        integer;
  v_from_custody      integer;
  v_to_custody        integer;
  v_from_custody_delta integer;
  v_to_custody_delta   integer;
  v_stock_model       text;
  v_branch_kind       text;
  v_branch_active     boolean;
begin
  -- An authenticated caller's name comes from app_users, never browser input.
  -- The Portal staff fallback is used only by the existing server-side postgres
  -- connection, which does not carry a Supabase auth.uid() claim.
  if v_uid is not null then
    select full_name into v_actor from public.app_users where id = v_uid;
  end if;
  v_actor := coalesce(v_actor, nullif(trim(p_payload ->> 'actor'), ''), 'Portal staff');

  if v_workflow not in ('STOCK_MOVE', 'REFILL_EXCHANGE') then
    raise exception using message = 'transfer_workflow_invalid', errcode = '22023';
  end if;
  if v_from is null or v_to is null or v_from = v_to then
    raise exception using message = 'transfer_branches_invalid', errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'lines') <> 'array' or jsonb_array_length(p_payload -> 'lines') = 0 then
    raise exception using message = 'transfer_needs_lines', errcode = '22023';
  end if;
  if v_notes is not null and char_length(v_notes) < 3 then
    raise exception using message = 'transfer_notes_too_short', errcode = '22023';
  end if;

  -- All staff may post a transfer, as approved. The caller must still name two
  -- active BRANCH locations; rider vans and depots cannot be chosen here.
  select kind, active into v_branch_kind, v_branch_active from public.stock_locations where id = v_from;
  if v_branch_kind is distinct from 'BRANCH' or v_branch_active is distinct from true then
    raise exception using message = 'transfer_source_branch_unavailable', errcode = '22023';
  end if;
  select kind, active into v_branch_kind, v_branch_active from public.stock_locations where id = v_to;
  if v_branch_kind is distinct from 'BRANCH' or v_branch_active is distinct from true then
    raise exception using message = 'transfer_destination_branch_unavailable', errcode = '22023';
  end if;

  select id, transfer_no into v_id, v_transfer_no
    from public.stock_transfers where idempotency_key = v_idem;
  if v_transfer_no is not null then
    return jsonb_build_object('id', v_id, 'transfer_no', v_transfer_no, 'replayed', true);
  end if;

  insert into public.stock_transfers (
    id, workflow, from_branch_id, to_branch_id, delivery_note, notes, actor, created_by, idempotency_key
  ) values (
    v_id, v_workflow, v_from, v_to, v_note, v_notes, v_actor, v_uid, v_idem
  ) returning transfer_no into v_transfer_no;

  for v_line in select value from jsonb_array_elements(p_payload -> 'lines') loop
    v_variant := nullif(v_line ->> 'variant_id', '');
    v_refills := coalesce(nullif(v_line ->> 'refills_sent', '')::integer, 0);
    v_empties_sent := coalesce(nullif(v_line ->> 'empties_sent', '')::integer, 0);
    v_empties_returned := coalesce(nullif(v_line ->> 'empties_returned', '')::integer, 0);

    if v_variant is null or v_refills < 0 or v_empties_sent < 0 or v_empties_returned < 0 then
      raise exception using message = 'transfer_line_invalid', errcode = '22023';
    end if;
    if v_workflow = 'STOCK_MOVE' and (v_refills + v_empties_sent = 0 or v_empties_returned <> 0) then
      raise exception using message = 'stock_move_quantities_invalid', errcode = '22023';
    end if;
    if v_workflow = 'REFILL_EXCHANGE' and (v_refills = 0 or v_empties_sent <> 0) then
      raise exception using message = 'refill_exchange_quantities_invalid', errcode = '22023';
    end if;

    select c.stock_model into v_stock_model
      from public.product_variants pv join public.categories c on c.id = pv.category_id
     where pv.id = v_variant;
    if v_stock_model is distinct from 'CYLINDER' then
      raise exception using message = 'transfer_variant_must_be_cylinder', errcode = '22023';
    end if;

    -- Lock each branch/variant in a stable order. A pair lock would allow
    -- A→B and A→C to spend A's stock concurrently.
    if v_from < v_to then
      perform pg_advisory_xact_lock(hashtext('stock:' || v_from || ':' || v_variant));
      perform pg_advisory_xact_lock(hashtext('stock:' || v_to || ':' || v_variant));
    else
      perform pg_advisory_xact_lock(hashtext('stock:' || v_to || ':' || v_variant));
      perform pg_advisory_xact_lock(hashtext('stock:' || v_from || ':' || v_variant));
    end if;

    select quantity into v_from_refills from public.inventory_positions
      where location_id = v_from and variant_id = v_variant and state = 'REFILL' for update;
    select quantity into v_to_refills from public.inventory_positions
      where location_id = v_to and variant_id = v_variant and state = 'REFILL' for update;
    select quantity into v_from_empties from public.inventory_positions
      where location_id = v_from and variant_id = v_variant and state = 'EMPTY' for update;
    select quantity into v_to_empties from public.inventory_positions
      where location_id = v_to and variant_id = v_variant and state = 'EMPTY' for update;
    select quantity into v_from_custody from public.cylinder_custody
      where location_id = v_from and variant_id = v_variant and custody = 'BRANCH' for update;
    select quantity into v_to_custody from public.cylinder_custody
      where location_id = v_to and variant_id = v_variant and custody = 'BRANCH' for update;
    -- SELECT ... FOR UPDATE has no row to lock when a destination position is
    -- new, so normalise each absent balance only after the row lock attempt.
    v_from_refills := coalesce(v_from_refills, 0);
    v_to_refills := coalesce(v_to_refills, 0);
    v_from_empties := coalesce(v_from_empties, 0);
    v_to_empties := coalesce(v_to_empties, 0);
    v_from_custody := coalesce(v_from_custody, 0);
    v_to_custody := coalesce(v_to_custody, 0);

    if v_from_refills < v_refills then raise exception using message = 'transfer_source_refills_insufficient', errcode = '22023'; end if;
    if v_workflow = 'STOCK_MOVE' and v_from_empties < v_empties_sent then raise exception using message = 'transfer_source_empties_insufficient', errcode = '22023'; end if;
    if v_workflow = 'REFILL_EXCHANGE' and v_to_empties < v_empties_returned then raise exception using message = 'transfer_destination_empties_insufficient', errcode = '22023'; end if;
    if v_from_custody < v_refills + v_empties_sent then raise exception using message = 'transfer_source_cylinders_insufficient', errcode = '22023'; end if;
    if v_workflow = 'REFILL_EXCHANGE' and v_to_custody < v_empties_returned then raise exception using message = 'transfer_destination_cylinders_insufficient', errcode = '22023'; end if;

    insert into public.stock_transfer_lines (transfer_id, variant_id, refills_sent, empties_sent, empties_returned)
      values (v_id, v_variant, v_refills, v_empties_sent, v_empties_returned);

    -- Filled cylinders always leave source and arrive at destination.
    insert into public.stock_movements (ledger_kind, operation, channel, occurred_at, location_id, counterparty_location_id, variant_id, state, quantity, balance_before, balance_after, reason, reference, actor, idempotency_key)
      values ('GAS','TRANSFER','INTERNAL',now(),v_from,v_to,v_variant,'REFILL',-v_refills,v_from_refills,v_from_refills-v_refills,'transfer ' || v_transfer_no,v_transfer_no,v_actor,v_idem),
             ('GAS','TRANSFER','INTERNAL',now(),v_to,v_from,v_variant,'REFILL', v_refills,v_to_refills,v_to_refills+v_refills,'transfer ' || v_transfer_no,v_transfer_no,v_actor,v_idem);
    insert into public.inventory_positions (location_id,variant_id,state,quantity) values (v_from,v_variant,'REFILL',v_from_refills-v_refills),(v_to,v_variant,'REFILL',v_to_refills+v_refills)
      on conflict (location_id,variant_id,state) do update set quantity=excluded.quantity, updated_at=now();

    if v_workflow = 'STOCK_MOVE' and v_empties_sent > 0 then
      insert into public.stock_movements (ledger_kind, operation, channel, occurred_at, location_id, counterparty_location_id, variant_id, state, quantity, balance_before, balance_after, reason, reference, actor, idempotency_key)
        values ('GAS','TRANSFER','INTERNAL',now(),v_from,v_to,v_variant,'EMPTY',-v_empties_sent,v_from_empties,v_from_empties-v_empties_sent,'transfer ' || v_transfer_no,v_transfer_no,v_actor,v_idem),
               ('GAS','TRANSFER','INTERNAL',now(),v_to,v_from,v_variant,'EMPTY', v_empties_sent,v_to_empties,v_to_empties+v_empties_sent,'transfer ' || v_transfer_no,v_transfer_no,v_actor,v_idem);
      insert into public.inventory_positions (location_id,variant_id,state,quantity) values (v_from,v_variant,'EMPTY',v_from_empties-v_empties_sent),(v_to,v_variant,'EMPTY',v_to_empties+v_empties_sent)
        on conflict (location_id,variant_id,state) do update set quantity=excluded.quantity, updated_at=now();
    elsif v_workflow = 'REFILL_EXCHANGE' and v_empties_returned > 0 then
      insert into public.stock_movements (ledger_kind, operation, channel, occurred_at, location_id, counterparty_location_id, variant_id, state, quantity, balance_before, balance_after, reason, reference, actor, idempotency_key)
        values ('GAS','TRANSFER','INTERNAL',now(),v_to,v_from,v_variant,'EMPTY',-v_empties_returned,v_to_empties,v_to_empties-v_empties_returned,'transfer ' || v_transfer_no,v_transfer_no,v_actor,v_idem),
               ('GAS','TRANSFER','INTERNAL',now(),v_from,v_to,v_variant,'EMPTY', v_empties_returned,v_from_empties,v_from_empties+v_empties_returned,'transfer ' || v_transfer_no,v_transfer_no,v_actor,v_idem);
      insert into public.inventory_positions (location_id,variant_id,state,quantity) values (v_to,v_variant,'EMPTY',v_to_empties-v_empties_returned),(v_from,v_variant,'EMPTY',v_from_empties+v_empties_returned)
        on conflict (location_id,variant_id,state) do update set quantity=excluded.quantity, updated_at=now();
    end if;

    v_from_custody_delta := -v_refills - v_empties_sent + v_empties_returned;
    v_to_custody_delta := -v_from_custody_delta;
    if v_from_custody_delta <> 0 then
      insert into public.stock_movements (ledger_kind, operation, channel, occurred_at, location_id, counterparty_location_id, variant_id, custody, quantity, balance_before, balance_after, reason, reference, actor, idempotency_key)
        values ('CYLINDER','TRANSFER','INTERNAL',now(),v_from,v_to,v_variant,'BRANCH',v_from_custody_delta,v_from_custody,v_from_custody+v_from_custody_delta,'transfer ' || v_transfer_no,v_transfer_no,v_actor,v_idem),
               ('CYLINDER','TRANSFER','INTERNAL',now(),v_to,v_from,v_variant,'BRANCH',v_to_custody_delta,v_to_custody,v_to_custody+v_to_custody_delta,'transfer ' || v_transfer_no,v_transfer_no,v_actor,v_idem);
      insert into public.cylinder_custody (location_id,variant_id,custody,quantity) values (v_from,v_variant,'BRANCH',v_from_custody+v_from_custody_delta),(v_to,v_variant,'BRANCH',v_to_custody+v_to_custody_delta)
        on conflict (location_id,variant_id,custody) do update set quantity=excluded.quantity, updated_at=now();
    end if;
  end loop;

  return jsonb_build_object('id', v_id, 'transfer_no', v_transfer_no);
end;
$$;

revoke all on function public.create_stock_transfer(jsonb) from public;
grant execute on function public.create_stock_transfer(jsonb) to authenticated;
