# Security

An internal staff portal that holds customer names, phone numbers, delivery
addresses, balances and sales history. Read this before changing how a screen is
served or how the database is reached.

## What is enforced today

| Concern | Where | Enforced? |
| --- | --- | --- |
| Unauthenticated access | `middleware.ts` redirects to `/login` | Yes |
| Deactivated / unprovisioned staff | `src/app/(portal)/layout.tsx` requires a live `app_users` row, else `/no-access` | Yes |
| Role-based permissions | `src/lib/access-policy.ts`, checked in every server action and restricted page | Yes |
| Row-level security | `supabase/migrations/*_rls_policies.sql`, forced on all 31 tables | **Partially** — see below |
| Public Data API (`/rest/v1`) | `20261020000029_close_data_api_and_provision_runtime_role.sql` | Yes — no client role has any privilege |
| Anon RPC execution | same migration | Yes — 0 functions executable by `anon` |
| Secrets in the client bundle | Only `NEXT_PUBLIC_*` values are exposed; the service-role key is server-only | Yes |
| CSV formula injection | `src/lib/reports/csv.ts` | Yes |
| Browser hardening headers | `next.config.ts` (`CSP`, `X-Frame-Options`, `nosniff`, HSTS) | Yes |

## The Data API is closed

The portal talks to PostgreSQL directly over `DATABASE_URL` and uses Supabase
only for Auth — there is not one `.from()` or `.rpc()` call in this repository.
The `public` schema was nevertheless reachable at
`https://<ref>.supabase.co/rest/v1/...` with the publishable key, which ships in
the browser bundle.

That mattered. `post_purchase_stock` is `SECURITY DEFINER`, performs **no role
check**, and carried `PUBLIC EXECUTE`. Anyone holding the publishable key — with
no login at all — could POST to `/rest/v1/rpc/post_purchase_stock` and insert
stock movements, inflate `inventory_positions` and create `stock_lots` at a cost
of their choosing. Twenty-one functions were executable by `anon` for the same
reason: `EXECUTE` is granted to `PUBLIC` by default on functions in this schema.

Migration 0029 revokes every privilege on `public` from `anon` and
`authenticated`, revokes `EXECUTE` from `PUBLIC` on every function, and resets
the default privileges so new objects are not born open. Verified after
applying:

```
functions executable by anon ....  0   (was 21)
table grants to client roles ....  0   (was 13)
tables with RLS forced ..........  31 / 31
```

If the Data API is ever wanted for a second client, re-granting is a deliberate
step, and the policies in the earlier migrations are already written for
`authenticated`.

## Row-level security: what it does and does not cover

Every table has RLS enabled **and forced**. That is not the same as the portal
being protected by it.

The portal connects as `postgres`, the owner of every object here, and that role
has `BYPASSRLS`. `FORCE ROW LEVEL SECURITY` does not override `BYPASSRLS`, so
**policies do not apply to the portal's own connection**. The application-layer
checks in `src/lib/access-policy.ts` are what actually decide whether an
attendant can edit a customer or see a balance.

Migration 0029 provisions `portal_app`, a role that can close that gap:

| Attribute | Value |
| --- | --- |
| `BYPASSRLS` | false |
| `SUPERUSER` / `CREATEROLE` / `CREATEDB` | false |
| Table privileges | `SELECT`, `INSERT`, `UPDATE` — never `DELETE` |
| `audit_log` | `SELECT` only |
| `stock_movements` | `SELECT`, `INSERT` — no `UPDATE` |
| DDL | none |
| `auth` schema | usage of `auth.uid()` / `auth.role()` / `auth.jwt()` only |
| Login | **disabled** until a password is set |

Verified by running as `portal_app`: it reads customers, staff and suppliers;
deleting a customer, updating the ledger, writing an audit row, creating a table
and reading `auth.users` are all refused by the database.

### Switching the portal onto it

`portal_app` is deliberately left without a password, so creating it changed
nothing. To hand the portal to the database:

1. Choose a password and set it **in the SQL editor**, not in this repository:

   ```sql
   alter role portal_app password '<a long random password>';
   ```

2. Point `DATABASE_URL` at it. On the Supabase pooler the user name is
   `role.project-ref`:

   ```
   postgresql://portal_app.kemxgwzwhohdbejwwezg:<password>@<pooler-host>:6543/postgres?sslmode=require
   ```

3. Redeploy and confirm the log no longer prints
   `connected as "postgres", which bypasses row-level security`.

The app logs the role it connected as on every cold start precisely so this is
visible rather than assumed.

### What this does *not* give you

`portal_app`'s policies are `using (true)`. They enforce **boundaries** — no
deletes, no DDL, no ledger rewrites, no `auth.users` — not per-user row
visibility, because the app does not pass a staff identity per query. Per-user
rules stay in `src/lib/access-policy.ts`, which is why that module is small,
centralised and tested.

Making the database itself enforce "attendant sees only their branch" would mean
setting `request.jwt.claims` on every query inside a transaction. That is a
larger change than it looks and is deliberately not half-done here.

## Authentication and staff lifecycle

- Staff are invited by an Admin. The invitation email lets them choose their own
  password; nobody else ever sees it.
- The `app_users` row is written in the same request as the Auth invitation. If
  the profile insert fails, the Auth user is deleted again so no orphan with a
  live session is left behind.
- Deactivating a staff member sets `is_active = false` **and** applies a
  Supabase Auth ban, so the existing session cannot keep calling the REST API.
  Reactivating lifts the ban.
- The last active Admin cannot be demoted or deactivated, and nobody can change
  their own role or deactivate themselves. Without that guard the portal could
  be left with no account able to invite or reset anybody.

## Authorisation rules

| Capability | Roles |
| --- | --- |
| Read dashboard, sales, stock, transfers | All staff |
| Post a sale, receive stock, transfer from a granted branch | Attendant, Manager, Admin, Director |
| View balances, invoices, payments, supplier spend; raise invoices and record payments | Manager, Admin, Director |
| Create a customer | All staff (counter registration) |
| Edit or deactivate a customer, their places or contacts | Manager, Admin, Director |
| Invite and manage staff | Admin |

## Data handling

- `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are server-only. Never prefix
  them with `NEXT_PUBLIC_`.
- `describeDatabaseConfig()` deliberately does not echo the host or the user
  name, because it is rendered on screen and a screenshot would leak the
  endpoint.
- The CSV export quotes and neutralises formula-leading values, and restricts
  balance and spend reports to Manager and above.
- `audit_log` and `stock_movements` are append-only; corrections are new rows,
  never edits. `portal_app` cannot rewrite either.

## Reporting a problem

Tell the repository owner (`Jack-Murimi/STOREARENA`) privately. Do not open a
public issue containing customer data, a connection string, or a description of
an unpatched weakness.
