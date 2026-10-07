# Gateway Gas Enterprises — Design System

Internal staff portal for LPG cylinder sales and stock across several branches.
Users are station attendants and managers working quickly, often on phones or
tablets, sometimes on weak connections. **Density beats decoration.** Every
pixel has to earn its place.

This document is binding. If a change conflicts with it, the change is wrong.

---

## 1. Stack

Next.js 16 (App Router, server components) · React 19 · TypeScript 5 ·
Tailwind CSS v4 (`@theme` tokens in `src/app/globals.css`). There is **no
component library** — the components in `src/components/ui/` are the library.

---

## 2. Tokens

All of them live in `@theme` in `src/app/globals.css`. **A component must never
contain a hex colour, an `rgba()`, or an arbitrary size like `text-[13.5px]`.**

| Token | Use |
|---|---|
| `--orange-500` | Primary fills, today's chart bar, focus ring |
| `--orange-700` | Orange **text and links** on light backgrounds (4.5:1) |
| `--bg` / `--surface` | App background / cards |
| `--border` | Every hairline |
| `--ink` / `--ink-muted` / `--ink-subtle` | Primary / secondary / tertiary text |
| `--nav-bg`, `--nav-text`, `--nav-hover`, `--nav-active` | Sidebar (warm charcoal) |
| `--ok` `--warn` `--critical` `--info` + `*-bg` | Status only |

### Orange never signals status

Orange means *this is the brand* or *this is the primary action*. Status is
green / amber / red / blue. If a screen needs to say "urgent", it uses
`--critical`, not orange.

### Type scale — 12 / 13 / 14 / 16 / 20 / 24

Utilities: `text-xs` (12) `text-sm` (13) `text-base` (14) `text-md` (16)
`text-lg` (20) `text-xl` (24). **Nothing below 12px.** Body is 14px, table
cells 13–14px.

Font is the existing sans (Geist). Numbers use the same face plus
`font-variant-numeric: tabular-nums` — apply the `.num` class. **Monospace is
for codes only** (`CUS-0001`, `TXN-4821`, `INV-0007`) via the `.code` class.
Never for money.

Money is always `KSh 1,050`. `K` abbreviations appear only on chart axes.

---

## 3. Components

Use these. Do not build a one-off version of any of them.

| Component | Purpose |
|---|---|
| `PageHeader` | Title, one-line subtitle, primary action top right, optional `menu` |
| `KpiCard` | Compact metric, ~88px, optional subtext, delta, chip |
| `StatusBadge` | Colour **+ icon + text**. Never colour alone |
| `FilterBar` | The single toolbar row: search · filters · primary action |
| `DataTable` | 44px rows, 36px header, grouped rows, whole-row links, mobile cards |
| `EmptyState` | Icon, title, one sentence, one action |
| `SegmentedControl` | Mutually exclusive filters, as links (URL-driven, no JS) |
| `Button` / `ButtonLink` | `primary` `secondary` `ghost` `danger` |
| `Skeleton` / `SkeletonRows` | Loading placeholders that match the final shape |

### Button rules

- **Primary**: `--orange-500` fill with **dark text** — white on orange fails
  4.5:1. Hover `--orange-400`, pressed `--orange-600`.
- **One primary button per screen.** Everything else is secondary or ghost.
- Admin-only or rarely used actions live in a `menu`, not in a second button.

### Status rule — one function, app-wide

`stockStatus()` in `src/lib/status.ts` is the only place this is decided:

```
Critical  onHand ≤ 50% of reorder level
Low       onHand ≤ reorder level
Healthy   otherwise
```

Nothing may re-implement it. Two screens disagreeing about whether a cylinder
is "Low" is worse than either threshold being slightly wrong.

---

## 4. Density and layout

| Rule | Value |
|---|---|
| Content max width | 1400px, centred |
| Page padding | 24px (16px under 768px) |
| Gap between cards | 16px |
| Card padding | 16px |
| Page header | ~56px |
| Table row / header | 44px / 36px |
| Sidebar | 232px, collapsible to a 64px icon rail |
| Tap target | 44px minimum on touch |

- **No nested scrolling.** Cards grow with content. Long lists show the latest
  5–6 rows and a "View all" link.
- Focus ring: 2px `--orange-500`, 2px offset, on every interactive element.
  Declared once globally in `globals.css`.
- Motion is capped at 200ms and fully disabled under `prefers-reduced-motion`.
- Tables under 768px collapse to stacked cards showing the three columns
  marked `priority` 1–3; the rest open on tap.
- No horizontal page scroll at any width: 1920, 1440, 1024, 768, 390.

---

## 5. Do

- Put related things together. One toolbar, one table, one place for the user
  and one for the branch.
- Say what a number is: "Stock on hand — at cost" not "Stock value".
- Show a delta only when it compares like-for-like, and label what it compares
  to. "vs Sun (full day)" against a part-finished Tuesday is a lie.
- Replace a dash with a quiet `—` rather than prose like "not bought yet".
- Hide rows that carry no information by default, with a toggle to show them.

## 6. Don't

- Don't use orange for status, alerts or errors.
- Don't put a search box in the global header. Search belongs to the page that
  has something to search: the customer list searches customers, the stock list
  searches products, and the dashboard has nothing to search at all.
- Don't repeat the same data in two panels. Merge them.
- Don't ship a nav item, card or button for something that does not exist yet.
- Don't hardcode a colour, size or radius in a component.
- Don't add a dependency for something eight lines of CSS can do.
- Don't leave a KPI card that is really just a link.

---

## 7. Adding a screen

1. `PageHeader` with the one primary action.
2. A `KpiCard` strip only if the numbers change a decision.
3. One `FilterBar`.
4. One `DataTable` with an `EmptyState`.
5. Rare or admin actions in the header `menu`.

If a screen needs more than that, the screen is probably two screens.
