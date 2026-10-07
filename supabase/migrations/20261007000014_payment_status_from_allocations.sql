-- invoice_payment_status summed supplier_payments.amount where invoice_id
-- matched, so money moved into supplier_payment_allocations was invisible to
-- it: an invoice could be allocated a payment and still show as owing it.
-- It now sums the allocations, which is where the money actually lives.
--
-- supplier_balances is deliberately untouched. Its balance is
-- opening + billed - total paid, and a payment is paid whether or not it has
-- been allocated yet, so that figure was already right. The unallocated
-- remainder sits on supplier_credit.
create or replace view public.invoice_payment_status with (security_invoker = true) as
select pi.id,
       pi.supplier_id,
       pi.branch_id,
       pi.invoice_no,
       pi.invoice_date,
       pi.due_date,
       pi.status,
       pi.total,
       coalesce(alloc.amount_paid, 0) as amount_paid,
       greatest(pi.total - coalesce(alloc.amount_paid, 0), 0) as amount_due,
       case
         when pi.status = 'void' then 'void'
         when coalesce(alloc.amount_paid, 0) >= pi.total then 'paid'
         when coalesce(alloc.amount_paid, 0) > 0 then 'part_paid'
         when pi.due_date is not null and pi.due_date < current_date then 'overdue'
         else 'unpaid'
       end as payment_status
  from public.purchase_invoices pi
  left join lateral (
    select sum(a.amount) as amount_paid
      from public.supplier_payment_allocations a
      join public.supplier_payments sp on sp.id = a.payment_id
     where a.invoice_id = pi.id
       and sp.status = 'posted'
  ) alloc on true;
