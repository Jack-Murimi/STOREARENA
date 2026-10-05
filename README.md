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

## Stock domain (for review — not yet wired to the UI)

`src/lib/stock/` is a framework-free TypeScript implementation of LPG stock
control, built to be reviewed before any screen is written on top of it:

- **Two ledgers**: gas stock (`REFILL` / `EMPTY` per branch and variant) and
  cylinder custody (where the company's own shells are). They move independently
  and are never conflated — a refill sale touches gas only, a new-cylinder sale
  touches both.
- **Operations**: purchase, refill sale, new-cylinder sale, exchange,
  empty return, depot return, inter-branch transfer, stocktake.
- **Append-only audit trail** with before/after balances, actor, reason,
  reference and idempotency key. Corrections are new movements, never edits.
- **Atomic**: commands stage their deltas and commit at the end, so a failed
  multi-line batch writes nothing at all.
- **Seed data** for Afri Gas, TotalEnergies and Rubis across three branches.
- **`schema.sql`** mirrors the domain in PostgreSQL, and the test suite executes
  it against a real Postgres engine (PGlite) to prove the constraints fire.

```bash
npm test      # 104 tests, including the SQL schema
```

Read [`docs/STOCK_ARCHITECTURE.md`](docs/STOCK_ARCHITECTURE.md) for the model,
the operation-to-ledger matrix and the open decisions.

## Roadmap

| Screen | Status |
| --- | --- |
| Operations dashboard | Built |
| Stock domain, schema and tests | Built — awaiting architecture review |
| Stock levels management | Blocked on the review above |
| Record a sale / cash-up | Next |
| Deliveries and depot requests | Planned |
| Reports and exports (CSV/XLSX) | Planned |
| Staff accounts, roles and audit log | Planned |
| Stock database + API | Next after the review |

The dashboard still renders sample data from `src/lib/data.ts`. Wiring it to the
stock domain is deliberately waiting on the architecture review, so the screens
are built once against a settled model.

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
