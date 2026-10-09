-- Correct the cost-price leak found while exercising RLS as the authenticated
-- role. Table-level SELECT implies every column; RLS cannot hide a column.
-- Use an explicit allow-list instead. The only omitted column is cost_at_sale.

revoke select on public.sale_lines from anon, authenticated;
revoke select (cost_at_sale) on public.sale_lines from anon, authenticated;

grant select (
  id, sale_id, variant_id, quantity, list_price, unit_price,
  empties_returned, line_total, discount_reason, line_type, discount_amount,
  empty_brand_id, price_override_reason, override_approved_by
) on public.sale_lines to authenticated;
