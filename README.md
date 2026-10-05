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
npm test      # 144 tests, including the SQL schema
```

Read [`docs/STOCK_ARCHITECTURE.md`](docs/STOCK_ARCHITECTURE.md) for the model,
the operation-to-ledger matrix and the open decisions.

## Roadmap

| Screen | Status |
| --- | --- |
| Operations dashboard | Built |
| Stock domain, schema and tests | Built — review answers applied, 144 tests green |
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
