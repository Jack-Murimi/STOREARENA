-- 0005 — reporting views.
--
-- Every view here is security_invoker = true, so it runs with the CALLER's
-- privileges and the caller's RLS applies. The opposite (security_barrier /
-- definer views) would let an attendant read another branch's totals through a
-- view they are not supposed to see.

-- Balance per supplier: opening + posted invoices - posted payments.
-- Void rows are excluded from every figure, which is what makes a void a true
-- reversal rather than a cosmetic label.
create or replace view public.supplier_balances
with (security_invoker = true) as
select
  s.id                                                        as supplier_id,
  s.name                                                      as supplier_name,
  s.payment_terms_days,
  s.opening_balance,
  coalesce(i.total_billed, 0)                                 as total_billed,
  coalesce(p.total_paid, 0)                                   as total_paid,
  s.opening_balance + coalesce(i.total_billed,0) - coalesce(p.total_paid,0) as balance,
  coalesce(i.overdue_amount, 0)                               as overdue_amount,
  i.last_invoice_date,
  p.last_payment_date,
  coalesce(i.bucket_current, 0)                               as ageing_current,
  coalesce(i.bucket_1_30, 0)                                  as ageing_1_30,
  coalesce(i.bucket_31_60, 0)                                 as ageing_31_60,
  coalesce(i.bucket_61_90, 0)                                 as ageing_61_90,
  coalesce(i.bucket_90_plus, 0)                               as ageing_90_plus
from public.suppliers s
left join lateral (
  select
    sum(pi.total)                                                            as total_billed,
    sum(pi.total) filter (where pi.due_date < current_date
                            and pi.status = 'posted')                        as overdue_amount,
    max(pi.invoice_date)                                                     as last_invoice_date,
    sum(pi.total) filter (where pi.due_date >= current_date or pi.due_date is null) as bucket_current,
    sum(pi.total) filter (where pi.due_date between current_date - 30 and current_date - 1) as bucket_1_30,
    sum(pi.total) filter (where pi.due_date between current_date - 60 and current_date - 31) as bucket_31_60,
    sum(pi.total) filter (where pi.due_date between current_date - 90 and current_date - 61) as bucket_61_90,
    sum(pi.total) filter (where pi.due_date < current_date - 90)             as bucket_90_plus
  from public.purchase_invoices pi
  where pi.supplier_id = s.id and pi.status = 'posted'
) i on true
left join lateral (
  select sum(sp.amount) as total_paid, max(sp.paid_on) as last_payment_date
  from public.supplier_payments sp
  where sp.supplier_id = s.id and sp.status = 'posted'
) p on true;

-- Payment status per invoice.
create or replace view public.invoice_payment_status
with (security_invoker = true) as
select
  pi.id,
  pi.supplier_id,
  pi.branch_id,
  pi.invoice_no,
  pi.invoice_date,
  pi.due_date,
  pi.status,
  pi.total,
  coalesce(paid.amount_paid, 0)                               as amount_paid,
  greatest(pi.total - coalesce(paid.amount_paid, 0), 0)        as amount_due,
  case
    when pi.status = 'void'                                   then 'void'
    when coalesce(paid.amount_paid,0) >= pi.total             then 'paid'
    when coalesce(paid.amount_paid,0) > 0                     then 'part_paid'
    when pi.due_date is not null and pi.due_date < current_date then 'overdue'
    else 'unpaid'
  end                                                          as payment_status
from public.purchase_invoices pi
left join lateral (
  select sum(sp.amount) as amount_paid
  from public.supplier_payments sp
  where sp.invoice_id = pi.id and sp.status = 'posted'
) paid on true;

-- Every unit cost ever paid, for the price comparison screen.
-- Only posted lines: a voided invoice is not evidence of a price.
create or replace view public.supplier_price_history
with (security_invoker = true) as
select
  l.product_id,
  l.purchase_type,
  i.supplier_id,
  i.branch_id,
  i.invoice_date,
  l.unit_cost,
  l.quantity,
  i.invoice_no,
  'invoice'::text as source
from public.purchase_invoice_lines l
join public.purchase_invoices i on i.id = l.invoice_id
where i.status = 'posted';
