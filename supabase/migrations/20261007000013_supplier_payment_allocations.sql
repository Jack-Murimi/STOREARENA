-- A supplier payment can cover several invoices, and whatever is left over is
-- held as unallocated credit on the supplier's account until someone
-- allocates it. supplier_payments.invoice_id stays as it is (already nullable)
-- and becomes merely "the invoice this was raised against, if any" - the money
-- is tracked here.
create table if not exists public.supplier_payment_allocations (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.supplier_payments (id) on delete restrict,
  invoice_id    uuid not null references public.purchase_invoices (id) on delete restrict,
  amount        numeric(14,2) not null check (amount > 0),
  allocated_on  date not null default current_date,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  -- one allocation per invoice per payment; split the payment, not the invoice
  unique (payment_id, invoice_id)
);

create index if not exists spa_payment_idx on public.supplier_payment_allocations (payment_id);
create index if not exists spa_invoice_idx on public.supplier_payment_allocations (invoice_id);

-- You must never allocate more out of a payment than it was worth. Deferred so
-- a single statement can delete an old allocation and insert a replacement
-- without tripping on the intermediate state.
create or replace function public.assert_supplier_allocation_within_payment()
returns trigger
language plpgsql
as $$
declare
  v_allocated numeric(14,2);
  v_amount    numeric(14,2);
begin
  select coalesce(sum(amount), 0) into v_allocated
    from public.supplier_payment_allocations
   where payment_id = coalesce(new.payment_id, old.payment_id);
  select amount into v_amount
    from public.supplier_payments
   where id = coalesce(new.payment_id, old.payment_id);

  if v_allocated > v_amount then
    raise exception 'allocations of % exceed the payment of %',
      v_allocated, v_amount;
  end if;
  return null;
end;
$$;

drop trigger if exists supplier_allocation_within_payment on public.supplier_payment_allocations;
create constraint trigger supplier_allocation_within_payment
  after insert or update or delete on public.supplier_payment_allocations
  deferrable initially deferred
  for each row execute function public.assert_supplier_allocation_within_payment();

-- Allocations are never hard-deleted alongside their payment; the payment is
-- voided instead, and the void path reverses them.
drop trigger if exists supplier_allocations_no_delete on public.supplier_payment_allocations;
create trigger supplier_allocations_no_delete
  before delete on public.supplier_payment_allocations
  for each row execute function public.refuse_hard_delete();

-- What is left of a payment after its allocations. A positive figure is credit
-- sitting on the supplier's account, available to allocate later.
create or replace view public.supplier_credit with (security_invoker = true) as
select p.supplier_id,
       p.id                                        as payment_id,
       p.amount                                    as paid,
       coalesce(a.allocated, 0)                    as allocated,
       p.amount - coalesce(a.allocated, 0)         as unallocated,
       p.paid_on
  from public.supplier_payments p
  left join (select payment_id, sum(amount) as allocated
               from public.supplier_payment_allocations group by payment_id) a
    on a.payment_id = p.id
 where p.status <> 'void';

-- Payments recorded before this table existed carry their invoice in
-- supplier_payments.invoice_id. Without this, supplier_credit reports them as
-- unallocated while invoice_payment_status still counts them as paid - two
-- sources of truth disagreeing about the same money.
insert into public.supplier_payment_allocations (payment_id, invoice_id, amount, allocated_on)
select p.id, p.invoice_id, p.amount, p.paid_on
  from public.supplier_payments p
 where p.invoice_id is not null
   and p.status <> 'void'
   and not exists (select 1 from public.supplier_payment_allocations a where a.payment_id = p.id)
on conflict (payment_id, invoice_id) do nothing;
