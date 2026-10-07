# RLS plan for the existing tables

Review this before anything is applied. Nothing here has been run against any
database.

## The one thing to understand first

RLS only applies to a connection acting as `anon` or `authenticated`. The app
today connects with `DATABASE_URL` as the **`postgres`** role, which has
`BYPASSRLS = true` and skips every policy.

So there are two steps, and they must happen together:

1. Write the policies (this document).
2. Switch the app from `postgres`/`DATABASE_URL` to the Supabase client with the
   **anon key plus a user session**.

Doing (1) without (2) protects nothing. Doing (2) without (1) breaks every page,
because a fresh `authenticated` role has no privileges on tables that currently
have no grants. **This is the risky part, and it is why the plan is per-table.**

Rollback: each migration is reversible by dropping its policies and re-granting,
and the app can be pointed back at `DATABASE_URL` immediately.

## Who touches what today

Verified by reading the data-access layer, not by guessing.

| Table | Read by | Written by |
|---|---|---|
| `categories` | `stock/products.ts`, `stock/stock-db.ts` | `stock/catalogue-seed.ts` |
| `brands` | `stock/products.ts`, `stock/stock-db.ts` | `catalogue-seed.ts`, `products.ts` |
| `product_variants` | `stock/products.ts`, `stock/stock-db.ts` | `catalogue-seed.ts`, `products.ts` |
| `stock_locations` | `stock/products.ts`, `stock/stock-db.ts` | `catalogue-seed.ts`, `products.ts` |
| `inventory_positions` | `stock/products.ts`, `stock/stock-db.ts` | `stock/stock-db.ts` |
| `stock_lots` | `stock/stock-db.ts` | `stock/stock-db.ts` |
| `stock_movements` | `stock/stock-db.ts` | `stock/stock-db.ts` |
| `cylinder_custody` | *(only via the `v_cylinder_counts` view)* | `stock/stock-db.ts` |
| `sales` | **nothing** | **nothing** |
| `sale_lines` | **nothing** | **nothing** |
| `customers` | `customers/repository.ts` | `customers/repository.ts` |
| `customer_locations` | `customers/repository.ts` | `customers/repository.ts` |
| `customer_contacts` | `customers/repository.ts` | `customers/repository.ts` |
| `invoices` | `billing/service.ts` | `billing/service.ts` |
| `invoice_lines` | `billing/service.ts` | `billing/service.ts` |
| `payments` | `billing/service.ts` | `billing/service.ts` |
| `payment_allocations` | `billing/service.ts` | `billing/service.ts` |

Two findings worth your attention:

- **`sales` and `sale_lines` are dead.** The dashboard reads sample data from
  `src/lib/data.ts`, not these tables. Policies for them are precautionary.
- **`cylinder_custody` is write-only from the app.** It is read through the
  `v_cylinder_counts` view, so the view needs `security_invoker = true` or it
  becomes a hole around the table's policy.

## Proposed policies

Roles: `attendant`, `manager`, `admin`, `director`. Branch scoping uses
`user_has_branch(branch_id)`.

### Reference data — read for all, write for manager+

`categories`, `brands`, `product_variants`, `stock_locations`

| Operation | Who |
|---|---|
| SELECT | every signed-in user (attendants need the catalogue to work) |
| INSERT / UPDATE | manager, admin, director |
| DELETE | **nobody** — deactivate instead |

Risk: **low**. Read-only for most users, and the catalogue is not sensitive.

### Stock — read within branch, write within branch

`inventory_positions`, `stock_lots`, `stock_movements`, `cylinder_custody`

| Operation | Who |
|---|---|
| SELECT | admin/director all branches; manager and attendant own branch only |
| INSERT | manager and attendant, own branch only |
| UPDATE | admin/director only |
| DELETE | nobody |

Risk: **medium**. `stock_movements` carries `balance_before`/`balance_after`, so
a cross-branch read leaks another branch's stock levels. Scoped accordingly.

Open question for you: should an attendant see **all** stock in their branch, or
only movements they recorded? I have proposed all — an attendant filling a
cylinder needs to see the shelf.

### Customers — the sensitive one

`customers`, `customer_locations`, `customer_contacts`

| Operation | Who |
|---|---|
| SELECT | every signed-in user (all branches — customers are not branch-scoped today) |
| INSERT / UPDATE | manager, admin, director |
| DELETE | nobody |

Risk: **high**, and this is where I need your decision. These tables hold names,
addresses and phone numbers, and there is **no `branch_id` column on
`customers`** — a customer is shared across branches today. So the honest
options are:

- **(a)** all staff read all customers — matches current behaviour, no page
  breaks;
- **(b)** add `branch_id` to customers and scope reads — correct, but it is a
  data-model change and it will need backfilling for the existing customer.

I have drafted **(a)** and flagged it. I would not choose (b) silently.

### Billing

`invoices`, `invoice_lines`, `payments`, `payment_allocations`

| Operation | Who |
|---|---|
| SELECT | manager, admin, director (attendants do not see balances) |
| INSERT | manager, admin, director |
| UPDATE | admin, director |
| DELETE | nobody |

Risk: **medium**. Attendants are excluded from balances, which matches the
purchases module.

### The views

`v_customer_balance`, `v_customer_directory`, `v_cylinder_counts`,
`v_inventory_value`, `v_invoice_outstanding`, `v_stock_cost`

All must be recreated with `security_invoker = true`. As they stand they run as
their definer and would bypass the policies on the tables underneath them.

Risk: **this is the easiest thing to get wrong.** A view left as
`security_barrier`/definer silently re-opens everything the policies just closed.

## Order of application

1. Grants + policies on reference data (lowest risk, verify pages still load).
2. Views switched to `security_invoker`.
3. Stock tables.
4. Customers.
5. Billing.
6. Only then: switch the app off `DATABASE_URL` onto the anon key.

Step 6 is the point of no return for that deploy. Everything before it is inert
while the app still connects as `postgres`, which is what makes the sequence
safe to stage.

## What I need from you

1. **Customers: option (a) or (b)?** This decides whether the auth phase
   includes a schema change to `customers`.
2. **Attendant stock visibility:** all branch stock, or only their own
   movements?
3. **Confirm the role→table matrix above.** Anything an attendant should not see
   that I have opened up.
