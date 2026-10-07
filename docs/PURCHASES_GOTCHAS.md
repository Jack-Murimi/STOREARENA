# Purchases: things that will bite you

## Payment method values are NOT the customer-side labels

`supplier_payments.method` is constrained to lowercase codes:

```sql
check (method = any (array['cash','mpesa','bank','cheque']))
```

The billing/customer domain uses display labels — `"M-Pesa"`, `"Bank Transfer"`,
`"Cash"`, `"Card"`. **They are not interchangeable.** Inserting `'M-Pesa'` fails
with:

```
new row for relation "supplier_payments" violates check constraint
"supplier_payments_method_check"
```

Any supplier payment form must map the label to the code before it writes. The
codes are the four above — there is no `card` for suppliers.

Other constraints on the same table worth knowing before building that form:

- `amount > 0` — a zero or negative payment is rejected.
- `status` is `posted` or `void` only, and `void` requires a `void_reason` of at
  least 10 characters (`supplier_payments_void_needs_reason`).
- `branch_id` references `stock_locations(id)`, so it is a text location id like
  `loc-jam`, not a name.

## Verified statement arithmetic

With one invoice and one payment on Glevak Gas Ltd:

| date | reference | kind | debit | credit | running |
| --- | --- | --- | --- | --- | --- |
| 2026-09-20 | GVK-2026-001 | invoice | 47,560.00 | 0.00 | **47,560.00** |
| 2026-10-01 | MP4X9K22 | payment | 0.00 | 20,000.00 | **27,560.00** |

`supplier_balances` agrees: `balance=27560.00`, `total_billed=47560.00`,
`total_paid=20000.00`. The running column is a window function over the union of
both sides, computed in the database.

## `suppliers` cannot be deleted

`refuse_hard_delete()` is attached as a `BEFORE DELETE` trigger
(migration `000012`). To retire a supplier, set `is_active = false`.

## Seeing whether a guard is really attached

`information_schema.triggers` lists internal foreign-key triggers as well, so it
will show a DELETE entry for a table that has no user-defined guard at all. Use:

```sql
select pg_get_triggerdef(oid) from pg_trigger
 where tgrelid = 'public.suppliers'::regclass and not tgisinternal;
```

An empty result means there is no guard, whatever `information_schema` suggests.
