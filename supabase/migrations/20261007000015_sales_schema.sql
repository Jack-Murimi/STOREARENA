-- SALES MODULE, phase 1: schema.
--
-- sales and sale_lines already existed and were EMPTY (verified: 0 rows each),
-- so these are renames and additions on unused tables, not a rebuild. Nothing
-- that the running app reads is dropped.
--
-- Three deliberate departures from the brief, each because the existing schema
-- could not hold what was asked:
--   * inventory_positions stays row-per-state. There is no quantity_full /
--     quantity_empty to constrain; the equivalent guard already exists as
--     CHECK (quantity >= 0).
--   * sales.sale_type previously meant REFILL/NEW_CYLINDER/EXCHANGE at the sale
--     level. That could not describe a sale containing both a refill and an
--     accessory, so the column is dropped and the semantics move to
--     sale_lines.line_type.
--   * sales.recorded_by was free text. RLS cannot be written against text, so it
--     becomes user_id referencing app_users. stock_movements.actor keeps its
--     free-text rule; the RPC fills it from the user's name.

-- ---------------------------------------------------------------- riders ----
create table if not exists public.riders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.app_users (id),
  name              text not null check (char_length(trim(name)) >= 2),
  phone             text not null check (char_length(trim(phone)) >= 7),
  branch_id         text not null references public.stock_locations (id),
  stock_location_id text references public.stock_locations (id),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id)
);

create unique index if not exists riders_phone_key on public.riders (phone);
create index if not exists riders_branch_idx on public.riders (branch_id);

-- Vans are stock-holding locations. The kind constraint is widened only if it
-- exists and only if it does not already allow VAN.
do $$
declare c text;
begin
  select pg_get_constraintdef(oid) into c
    from pg_constraint
   where conrelid = 'public.stock_locations'::regclass
     and conname = 'stock_locations_kind_check';
  if c is not null and c not ilike '%VAN%' then
    execute 'alter table public.stock_locations drop constraint stock_locations_kind_check';
    execute $q$alter table public.stock_locations
                 add constraint stock_locations_kind_check
                 check (kind in ('BRANCH','VAN','DEPOT'))$q$;
  end if;
end $$;

-- ------------------------------------------------- product price guard-rails --
alter table public.product_variants
  add column if not exists min_price            numeric(14,2),
  add column if not exists max_discount_percent numeric(5,2) not null default 0
    check (max_discount_percent >= 0 and max_discount_percent <= 100);

comment on column public.product_variants.min_price is
  'Floor price. NULL means no discounting is permitted on this variant at all.';

-- credit limit, needed by create_sale rule 7
alter table public.customers
  add column if not exists credit_limit_ksh numeric(14,2) not null default 0
    check (credit_limit_ksh >= 0);

-- sales.id, sale_lines.sale_id and sales.idempotency_key are TEXT in the legacy
-- schema. Both tables are empty, so they are converted to uuid to match the
-- brief. Catalogue ids (variant_id, branch_id, stock_location_id) stay TEXT
-- because that is what the rest of the schema uses.
alter table public.sale_lines drop constraint if exists sale_lines_sale_id_fkey;
alter table public.sale_lines alter column sale_id type uuid using sale_id::uuid;
alter table public.sales alter column id type uuid using id::uuid;
alter table public.sales alter column idempotency_key type uuid using idempotency_key::uuid;
alter table public.sale_lines
  add constraint sale_lines_sale_id_fkey
  foreign key (sale_id) references public.sales (id) on delete restrict;

-- ------------------------------------------------------------- sales: shape --
alter table public.sales drop constraint if exists sales_sale_type_check;
alter table public.sales drop constraint if exists sales_channel_check;
alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales drop constraint if exists sales_recorded_by_check;

alter table public.sales drop column if exists sale_type;
alter table public.sales drop column if exists channel;
alter table public.sales drop column if exists payment_method;
alter table public.sales drop column if exists customer_ref;
alter table public.sales drop column if exists recorded_by;

alter table public.sales rename column location_id    to branch_id;
alter table public.sales rename column sold_at        to sale_date;
alter table public.sales rename column list_total_ksh to subtotal;
alter table public.sales rename column total_ksh      to total;

alter table public.sales
  add column if not exists receipt_no            text,
  -- customers.id and customer_locations.id are TEXT in this schema, so these
  -- cannot be uuid as the brief assumed.
  add column if not exists customer_id           text references public.customers (id),
  add column if not exists customer_location_id  text references public.customer_locations (id),
  add column if not exists rider_id              uuid references public.riders (id),
  add column if not exists stock_location_id     text references public.stock_locations (id),
  add column if not exists sale_type             text not null default 'counter'
    check (sale_type in ('counter','delivery')),
  add column if not exists discount_total        numeric(14,2) not null default 0
    check (discount_total >= 0),
  add column if not exists amount_paid           numeric(14,2) not null default 0
    check (amount_paid >= 0),
  add column if not exists balance_due           numeric(14,2) not null default 0
    check (balance_due >= 0),
  add column if not exists credit_due_date       date,
  add column if not exists status                text not null default 'posted'
    check (status in ('posted','void')),
  add column if not exists void_reason           text,
  add column if not exists notes                 text,
  add column if not exists user_id               uuid references public.app_users (id),
  add column if not exists version               integer not null default 1,
  add column if not exists updated_at            timestamptz not null default now(),
  add column if not exists updated_by            uuid references auth.users (id);

alter table public.sales alter column receipt_no set not null;
alter table public.sales alter column idempotency_key set not null;
alter table public.sales alter column subtotal set default 0;
alter table public.sales alter column total    set default 0;

-- Receipt numbers are typed by staff, so uniqueness is scoped to the branch.
create unique index if not exists sales_receipt_no_branch_key
  on public.sales (branch_id, receipt_no);
create unique index if not exists sales_idempotency_key_key
  on public.sales (idempotency_key);
create index if not exists sales_branch_date_idx  on public.sales (branch_id, sale_date desc);
create index if not exists sales_customer_idx     on public.sales (customer_id);
create index if not exists sales_rider_idx        on public.sales (rider_id);
create index if not exists sales_status_idx       on public.sales (status);

-- delivery needs a rider and a location; counter needs neither
alter table public.sales drop constraint if exists sales_delivery_needs_rider;
alter table public.sales
  add constraint sales_delivery_needs_rider check (
    sale_type <> 'delivery' or (rider_id is not null and customer_location_id is not null)
  );
-- credit is never extended to a walk-in, and always has a due date
alter table public.sales drop constraint if exists sales_credit_needs_customer;
alter table public.sales
  add constraint sales_credit_needs_customer check (
    balance_due = 0 or (customer_id is not null and credit_due_date is not null)
  );
alter table public.sales drop constraint if exists sales_total_is_net_of_discount;
alter table public.sales
  add constraint sales_total_is_net_of_discount check (total = subtotal - discount_total);
alter table public.sales drop constraint if exists sales_paid_plus_due_equals_total;
alter table public.sales
  add constraint sales_paid_plus_due_equals_total check (amount_paid + balance_due = total);
alter table public.sales drop constraint if exists sales_void_needs_reason;
alter table public.sales
  add constraint sales_void_needs_reason check (
    status <> 'void' or (void_reason is not null and char_length(trim(void_reason)) >= 10)
  );
-- no sale may ever be backdated into the future
alter table public.sales drop constraint if exists sales_not_in_future;
alter table public.sales
  add constraint sales_not_in_future check (sale_date <= now());

-- ------------------------------------------------------------ sale_lines -----
alter table public.sale_lines rename column empties_received to empties_returned;
alter table public.sale_lines rename column list_price_ksh   to list_price;
alter table public.sale_lines rename column unit_price_ksh   to unit_price;
alter table public.sale_lines rename column line_total_ksh   to line_total;

alter table public.sale_lines
  add column if not exists line_type              text not null default 'refill'
    check (line_type in ('refill','new_cylinder','accessory','water','other')),
  add column if not exists discount_amount        numeric(14,2) not null default 0
    check (discount_amount >= 0),
  add column if not exists empty_brand_id         text references public.brands (id),
  add column if not exists cost_at_sale           numeric(14,2),
  add column if not exists price_override_reason  text,
  add column if not exists override_approved_by   uuid references public.app_users (id);

create index if not exists sale_lines_sale_idx    on public.sale_lines (sale_id);
create index if not exists sale_lines_variant_idx on public.sale_lines (variant_id);

alter table public.sale_lines drop constraint if exists sale_lines_refill_needs_empties;
alter table public.sale_lines
  add constraint sale_lines_refill_needs_empties check (
    line_type <> 'refill' or (empties_returned >= 0 and empty_brand_id is not null)
  );
-- line_total is GENERATED from quantity * unit_price, so it cannot also carry
-- the discount: a CHECK demanding line_total = quantity*unit_price - discount
-- would reject every discounted line. The discount lives in discount_amount
-- and the sale totals are reconciled by create_sale instead.
-- a price override without a recorded reason is not an override, it is a typo
alter table public.sale_lines drop constraint if exists sale_lines_override_needs_reason;
alter table public.sale_lines
  add constraint sale_lines_override_needs_reason check (
    unit_price >= list_price or price_override_reason is not null
  );

-- ---------------------------------------------------------- sale_payments ----
create table if not exists public.sale_payments (
  id         uuid primary key default gen_random_uuid(),
  sale_id    uuid not null references public.sales (id) on delete restrict,
  method     text not null check (method in ('cash','mpesa','bank','card','credit')),
  amount     numeric(14,2) not null check (amount > 0),
  reference  text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index if not exists sale_payments_sale_idx on public.sale_payments (sale_id);

-- card and electronic payments must be traceable
alter table public.sale_payments drop constraint if exists sale_payments_needs_reference;
alter table public.sale_payments
  add constraint sale_payments_needs_reference check (
    method not in ('mpesa','bank','card') or (reference is not null and char_length(trim(reference)) >= 3)
  );

-- ------------------------------------------------------- audit and no-delete --
drop trigger if exists riders_set_updated_at on public.riders;
create trigger riders_set_updated_at
  before update on public.riders
  for each row execute function public.set_updated_at();

drop trigger if exists sales_set_updated_at on public.sales;
create trigger sales_set_updated_at
  before update on public.sales
  for each row execute function public.set_updated_at();

drop trigger if exists sales_no_delete on public.sales;
create trigger sales_no_delete
  before delete on public.sales
  for each row execute function public.refuse_hard_delete();

drop trigger if exists sale_lines_no_delete on public.sale_lines;
create trigger sale_lines_no_delete
  before delete on public.sale_lines
  for each row execute function public.refuse_hard_delete();

drop trigger if exists sale_payments_no_delete on public.sale_payments;
create trigger sale_payments_no_delete
  before delete on public.sale_payments
  for each row execute function public.refuse_hard_delete();

drop trigger if exists riders_no_delete on public.riders;
create trigger riders_no_delete
  before delete on public.riders
  for each row execute function public.refuse_hard_delete();
