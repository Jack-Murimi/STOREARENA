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

## Roadmap

| Screen | Status |
| --- | --- |
| Operations dashboard | Built (this commit) |
| Stock levels management | Next |
| Record a sale / cash-up | Next |
| Deliveries and depot requests | Planned |
| Reports and exports (CSV/XLSX) | Planned |
| Staff accounts, roles and audit log | Planned |
| Stock database + API | Planned |

The dashboard currently renders sample data. Replacing
`src/lib/data.ts` with database queries is the only change needed to go live —
the components read the same types defined in `src/lib/types.ts`.

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
