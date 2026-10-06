# Gateway Gas Enterprises — Staff Portal

Internal web portal for **Gateway Gas Enterprises** staff to track LPG cylinder
stock and daily sales counts. Built with Next.js (App Router), React 19 and
Tailwind CSS v4.

## What is here today

The **operations dashboard** (`src/app/page.tsx`) — the screen staff land on:

- **Headline numbers** — cylinders sold today, takings today, gas on hand (kg),
  and the number of reorder alerts.
- **Takings, last 7 days** — revenue chart built with plain CSS bars, no chart
  library.
- **Replenishment needed** — cylinder sizes at or below their reorder level,
  worst first.
- **Stock levels** — on hand / empties / storage used / status / refill price for
  each cylinder size (3, 6, 13, 35 and 50 kg).
- **Today's sales** — transaction feed with cylinder size, quantity, payment
  method and the attendant who recorded it.
- **Quick actions** — record a sale, receive a delivery, end-of-day cash-up.
- **Sales mix** — takings split by cylinder size and by payment method.

Every figure on the page is **derived from the same data** in
`src/lib/data.ts` through the helpers in `src/lib/metrics.ts`, so the KPI row,
the chart and the sales feed can never disagree with one another.

## Stock domain (reviewed — not yet wired to the UI)

`src/lib/stock/` is a framework-free TypeScript implementation of LPG stock
control. The architecture has been reviewed with the owner and the answers are
now applied:

- **Two ledgers**: gas stock (`REFILL` / `EMPTY` per location and variant) and
  cylinder custody (where the company's own shells are). They move independently
  and are never conflated — a refill sale touches gas only, a cylinder-left-out
  sale touches both.
- **Rider vans are stock locations.** Most sales happen at the customer's door,
  so a van is loaded by transfer, sells all day on the `DELIVERY` channel, and
  is reconciled at night. What is on the road is never invisible.
- **Exchange accepts any brand of the same size**, because customers hand back
  whatever empty they have. The incoming empty is booked against its own brand —
  a Total 13 kg empty raises Total empties, not Afri Gas.
- **No deposits**, and no charge for the cylinder itself: the schema holds no
  deposit column at all.
- **Cylinder count = refills + empties.** 3 filled plus 4 empty 13 kg Afri Gas
  is 7 cylinders.
- **List vs charged price on every line**, with a reason required for any
  deviation and discounts one query away (`sales.discounted()`).
- **Append-only audit trail** with before/after balances, actor, reason,
  reference, channel and idempotency key. Corrections are new movements, never
  edits.
- **Atomic**: commands stage their deltas and commit at the end, so a failed
  multi-line batch writes nothing at all — not even a sale row.
- **Seed data** for Afri Gas, TotalEnergies and Rubis across three branches, one
  closed branch and two rider vans.
- **`schema.sql`** mirrors the domain in PostgreSQL, and the test suite executes
  it against a real Postgres engine (PGlite) to prove the constraints fire.

```bash
npm test      # 198 tests, including both SQL schemas
```

Read [`docs/STOCK_ARCHITECTURE.md`](docs/STOCK_ARCHITECTURE.md) for the model,
the operation-to-ledger matrix and the open decisions.

## Customers (live CRUD)

`/customers` is a working screen, not a mockup: create, read, update and delete
customers, their delivery places and the people to call.

A customer is a household or a business, and one customer can have:

- **Several delivery places** — main house, annex, shop — each with a label, a
  free-text address ("house no 46 on Kinyajui road off Naivasha road"),
  additional details for the rider ("opposite Fryz Inn hotel"), an optional map
  pin, and exactly one marked as the main place.
- **Several phone numbers** — each with the name of the person who answers and,
  optionally, their role: wife, father, children, maid, caretaker. The role is
  free text, with the common ones offered as suggestions.

Rules the code and the database both enforce:

- A customer always has at least one delivery place and one phone number — the
  last of either cannot be removed.
- Numbers are stored normalised to `+254…`, so `0712 345 678`, `+254712345678`
  and `712345678` are all the same number. Landlines are refused.
- A label is unique within a customer. **A phone number is unique across the
  whole book** — it cannot appear on two accounts, and a refusal names the
  customer who already has it.

## Inventory and the product catalogue

`/inventory` lists every product with what each branch is holding, and adds new
ones. The catalogue lives in `src/lib/stock/catalogue-data.ts` and is seeded by
`seedCatalogue()`, which is safe to re-run.

- **Three categories** — LPG cylinders, drinking water, accessories and
  fittings. Only cylinders are weighed: the database refuses a kilogram size on
  anything that is not a cylinder, and refuses a cylinder with no size.
- **A brand appears once**, with the sizes it comes in. "MID GAS" and "MIDGAS"
  are one brand. A new brand can be created in the same step as its first
  product, because starting to stock a brand is one decision.
- **An empty cylinder is not a second product.** "13KG AFRIGAS" and "13KG
  AFRIGAS EMPTY" are the same variant in two states, kept apart by
  `inventory_positions` — which is what makes an exchange balance instead of
  inventing stock. Cylinders on hand = refills + empties.
- **Stock is per location.** Branches and rider vans are both locations; a van
  must belong to a branch and name the rider responsible for it.

Seeded from the price list: 69 products across 36 brands, in 6, 13, 22.5, 35,
45 and 50 kg.

The branches are seeded too — **Nextgen (NXG), Lavington (LAV), Jamhuri (JAM)
and Kileleshwa (KIL)** — in `BRANCHES`. Re-seeding adds a branch you have
created since; it never removes one.

## Invoices, payments and balances

`src/lib/billing/` is the money side of a customer. It is deliberately separate
from gas stock: what a customer owes and what cylinders they are holding are
two different questions.

- **Invoice** — raised when gas goes out (normally by the stock layer when a
  sale is committed), or directly for extras that never touched a cylinder.
  Numbered `INV-0001` upwards; lines keep the order they were entered.
- **Payment** — M-Pesa, cash, bank transfer, cheque or card, each with an
  optional reference. Money is spread over the **oldest unpaid invoice first**;
  anything left over sits on the account as credit.
- **Balance** — everything invoiced minus everything paid. Credit is normal
  here: nobody is blocked from ordering because they still owe last month. A
  negative balance means they are in credit.
- A cancelled invoice keeps its record but stops counting towards debt.
- The database refuses to allocate more to an invoice than it totals
  (`trg_allocation_within_invoice`), so a statement can never show an invoice
  paid twice.

Tables `invoices`, `invoice_lines`, `payments`, `payment_allocations`; views
`v_customer_balance` and `v_invoice_outstanding`. The DDL is in
`src/lib/customers/billing.sql` and is safe to re-run.
- Exactly one place and one number are primary; removing the primary promotes
  the next one.
- A map pin is both coordinates or neither, and they must be real coordinates —
  half a pin would send a rider to the equator. "Use my location" reads the
  browser's own position, so standing at the gate is enough to pin a place.
- Deleting a customer removes their places and numbers. Recorded sales are not
  touched.

Every refusal is shown on screen with the reason, and every change runs in one
transaction, so a half-written customer cannot survive.

### Connecting the database

The screens read `DATABASE_URL`. Put it in `.env.local` (already git-ignored):

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres?sslmode=require
```

Then create the tables once — paste `src/lib/customers/schema.sql` into
Supabase → SQL Editor and run it.

### Deploying (Netlify, Vercel, anywhere serverless)

Set `DATABASE_URL` in the host's environment variables — **Site configuration →
Environment variables** on Netlify — then redeploy. Use the **transaction
pooler** URI from Supabase → Connect, not the direct `db.<ref>.supabase.co`
host: serverless functions are short-lived and the pooler is built for them.

```
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres?sslmode=require
```

The demo store never runs in a production build (PGlite is a devDependency and a
function has no writable filesystem). Without a reachable database the customer
screens show what to configure instead of failing.

If `DATABASE_URL` is missing or the database cannot be reached, the app falls
back to a temporary in-process PostgreSQL seeded with demo customers and says so
in a banner at the top of the screen. Nothing is silently written to the wrong
place.

## Roadmap

| Screen | Status |
| --- | --- |
| Operations dashboard | Built |
| Stock domain, schema and tests | Built — review answers applied |
| Customers: full CRUD, places and people to call | Built — 54 tests, live against Supabase |
| Staff login (so `actor` comes from a session, not a typed name) | Next |
| Stock levels management | Next |
| Record a sale / cash-up | Next |
| Rider van loading and night reconciliation | Planned |
| Deliveries and depot requests | Planned |
| Reports and exports (CSV/XLSX), incl. discount report | Planned |
| Stock database + API | Planned |

The dashboard still renders sample data from `src/lib/data.ts`. The stock domain
is settled, so the screens can now be built once against it.

One open decision before the screens go in: **actor identity**. Every movement and
sale already records the actor, but it is a typed-in name today. The recommendation
is a staff login first, so the audit trail names a real authenticated user.

## Sample data

Prices in `src/lib/data.ts` follow typical Nairobi retail LPG refill rates
(roughly KSh 110–120 per kg) and are **placeholders**. Station management should
set the real prices from the settings screen once it exists.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint
```

## Project layout

```
src/
  app/
    layout.tsx      metadata, fonts, shell
    page.tsx        operations dashboard
    globals.css     Tailwind v4 theme tokens (navy + flame brand palette)
    icon.svg        browser tab icon
  components/
    Sidebar.tsx     navigation + signed-in staff
    Topbar.tsx      page title, date, search, alerts
    BrandMark.tsx   Gateway Gas lockup
    icons.tsx       inline SVG icon set (no icon dependency)
    dashboard/      KpiCard, Panel, StockTable, SalesTrendChart,
                    RecentSales, ReplenishmentAlerts, QuickActions, SalesMix
  lib/
    types.ts        domain types (cylinders, sales, daily totals)
    data.ts         sample records — swap for database queries
    metrics.ts      pure functions: revenue, kg sold, reorder status, …
    format.ts       KSh / kg / date formatting (Africa/Nairobi)
```
