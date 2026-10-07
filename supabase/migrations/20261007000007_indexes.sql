-- 0007 — indexes for the query shapes the screens actually use.

create index if not exists purchase_invoices_supplier_idx on public.purchase_invoices (supplier_id);
create index if not exists purchase_invoices_branch_idx   on public.purchase_invoices (branch_id);
create index if not exists purchase_invoices_date_idx     on public.purchase_invoices (invoice_date desc);
create index if not exists purchase_invoices_status_idx   on public.purchase_invoices (status);
-- The list screen filters by status and branch then sorts newest first.
create index if not exists purchase_invoices_list_idx
  on public.purchase_invoices (branch_id, status, invoice_date desc);

create index if not exists purchase_lines_invoice_idx on public.purchase_invoice_lines (invoice_id);
create index if not exists purchase_lines_product_idx on public.purchase_invoice_lines (product_id, purchase_type);

create index if not exists supplier_payments_supplier_idx on public.supplier_payments (supplier_id);
create index if not exists supplier_payments_invoice_idx  on public.supplier_payments (invoice_id);

create index if not exists supplier_quotes_lookup_idx
  on public.supplier_price_quotes (product_id, purchase_type, supplier_id);

create index if not exists audit_log_lookup_idx
  on public.audit_log (table_name, record_id, occurred_at desc);
