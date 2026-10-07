-- 0002 — the purchases tables.
--
-- Money is numeric(14,2) everywhere. Never float: 0.1 + 0.2 is not 0.3 in a
-- double, and a rounding error in a supplier balance is an argument with a
-- supplier. Rounding happens in the RPC, not in the client.
--
-- Nothing in this module is ever hard-deleted. Rows go to status = 'void' with
-- a mandatory reason, and a BEFORE DELETE trigger refuses anything else, so a
-- future query mistake cannot silently erase purchase history.
--
-- Adapted to the existing schema: stock_locations.id and product_variants.id
-- are TEXT in this database, not uuid, so the foreign keys below are text.

create table if not exists public.suppliers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  kra_pin             text,
  phone               text,
  email               text,
  contact_person      text,
  payment_terms_days  integer not null default 0 check (payment_terms_days >= 0),
  opening_balance     numeric(14,2) not null default 0,
  is_active           boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id)
);

create table if not exists public.purchase_invoices (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    uuid not null references public.suppliers (id),
  branch_id      text not null references public.stock_locations (id),
  invoice_no     text not null,
  invoice_date   date not null default current_date,
  due_date       date,
  status         text not null default 'posted'
                   check (status in ('draft','posted','void')),
  subtotal       numeric(14,2) not null default 0,
  vat_amount     numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,
  notes          text,
  attachment_path text,
  void_reason    text,
  version        integer not null default 1 check (version >= 1),
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  -- One supplier may reuse an invoice number across years, but not twice.
  -- Enforced here rather than in the app so a double-click cannot create two.
  constraint purchase_invoices_supplier_no_unique unique (supplier_id, invoice_no),
  constraint purchase_invoices_void_needs_reason
    check (status <> 'void' or (void_reason is not null and length(trim(void_reason)) >= 10)),
  constraint purchase_invoices_totals_consistent
    check (total = subtotal + vat_amount)
);

comment on constraint purchase_invoices_totals_consistent on public.purchase_invoices is
  'Total is recomputed server-side by the RPC; this check makes a hand-edit that breaks the arithmetic impossible.';

create table if not exists public.purchase_invoice_lines (
  id            bigint generated always as identity primary key,
  invoice_id    uuid not null references public.purchase_invoices (id) on delete restrict,
  product_id    text not null references public.product_variants (id),
  -- 'refill' means we bought gas to fill OUR OWN empties. 'new_cylinder' means
  -- we bought a filled cylinder that stays a cylinder. These are different
  -- things and must never be averaged or compared against each other, which is
  -- why every price view and comparison carries purchase_type alongside
  -- product_id.
  purchase_type text not null
                  check (purchase_type in ('refill','new_cylinder','accessory','water','other')),
  quantity      numeric(12,2) not null check (quantity > 0),
  unit_cost     numeric(14,2) not null check (unit_cost >= 0),
  line_total    numeric(14,2) generated always as (quantity * unit_cost) stored
);

comment on column public.purchase_invoice_lines.line_total is
  'Stored generated column, so a line total can never disagree with qty x cost.';

create table if not exists public.supplier_payments (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references public.suppliers (id),
  -- Null means an on-account payment not tied to one invoice.
  invoice_id   uuid references public.purchase_invoices (id),
  branch_id    text not null references public.stock_locations (id),
  paid_on      date not null default current_date,
  amount       numeric(14,2) not null check (amount > 0),
  method       text not null check (method in ('cash','mpesa','bank','cheque')),
  reference    text,
  status       text not null default 'posted' check (status in ('posted','void')),
  void_reason  text,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  constraint supplier_payments_void_needs_reason
    check (status <> 'void' or (void_reason is not null and length(trim(void_reason)) >= 10))
);

create table if not exists public.supplier_price_quotes (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references public.suppliers (id),
  product_id    text not null references public.product_variants (id),
  purchase_type text not null
                  check (purchase_type in ('refill','new_cylinder','accessory','water','other')),
  unit_price    numeric(14,2) not null check (unit_price >= 0),
  valid_from    date not null default current_date,
  valid_to      date,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  constraint supplier_price_quotes_dates_sane check (valid_to is null or valid_to >= valid_from)
);

-- No hard deletes, enforced in the database rather than by convention.
create or replace function public.refuse_hard_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are never deleted - set status = ''void'' with a reason instead',
    tg_table_name;
end;
$$;

drop trigger if exists purchase_invoices_no_delete on public.purchase_invoices;
create trigger purchase_invoices_no_delete
  before delete on public.purchase_invoices
  for each row execute function public.refuse_hard_delete();

drop trigger if exists purchase_lines_no_delete on public.purchase_invoice_lines;
create trigger purchase_lines_no_delete
  before delete on public.purchase_invoice_lines
  for each row execute function public.refuse_hard_delete();

drop trigger if exists supplier_payments_no_delete on public.supplier_payments;
create trigger supplier_payments_no_delete
  before delete on public.supplier_payments
  for each row execute function public.refuse_hard_delete();

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

drop trigger if exists purchase_invoices_set_updated_at on public.purchase_invoices;
create trigger purchase_invoices_set_updated_at
  before update on public.purchase_invoices
  for each row execute function public.set_updated_at();

drop trigger if exists supplier_payments_set_updated_at on public.supplier_payments;
create trigger supplier_payments_set_updated_at
  before update on public.supplier_payments
  for each row execute function public.set_updated_at();

drop trigger if exists supplier_price_quotes_set_updated_at on public.supplier_price_quotes;
create trigger supplier_price_quotes_set_updated_at
  before update on public.supplier_price_quotes
  for each row execute function public.set_updated_at();
