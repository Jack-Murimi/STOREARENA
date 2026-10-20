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
| Row-level security | `supabase/migrations/*_rls_policies.sql` | **No** — see below |
| Secrets in the client bundle | Only `NEXT_PUBLIC_*` values are exposed; the service-role key is server-only | Yes |
| CSV formula injection | `src/lib/reports/csv.ts` | Yes |
| Browser hardening headers | `next.config.ts` (`CSP`, `X-Frame-Options`, `nosniff`, HSTS) | Yes |

### The RLS caveat, stated plainly

The policies in `supabase/migrations/` are correct SQL, but the portal connects
with `DATABASE_URL` as the `postgres` role, which has `BYPASSRLS`. **Policies do
not run on that connection.** Any claim that RLS protects this application today
would be false.

What protects it today is the three layers listed above: middleware, the portal
layout, and role checks in the server actions. They are deliberately centralised
so the checks cannot drift apart, and they are covered by
`src/lib/__tests__/auth.test.ts`.

Closing the gap has two possible shapes:

1. **Connect as a non-`BYPASSRLS` role** (for example `authenticated` via
   PostgREST, or a dedicated `portal_app` role granted only the tables it needs).
   Then the existing policies start doing work, and the app-layer checks remain
   as defence in depth.
2. **Keep the owner connection** and treat the app layer as the only control.
   Acceptable, but then no new write path may skip `access-policy.ts`.

Either choice needs a role provisioned in the database, which is why it is
recorded here instead of being half-done in code.

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
- Audit rows (`audit_log`, `stock_movements`) are append-only; corrections are
  new rows, never edits.

## Reporting a problem

Tell the repository owner (`Jack-Murimi/STOREARENA`) privately. Do not open a
public issue containing customer data, a connection string, or a description of
an unpatched weakness.
