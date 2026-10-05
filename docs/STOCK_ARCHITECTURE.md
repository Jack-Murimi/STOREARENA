# LPG Stock Architecture — Gateway Gas Enterprises

**Status: for review.** No UI has been built against this yet. The domain, the
relational schema and 104 tests are ready; the questions at the bottom are the
ones worth settling before any screen is written.

- Code: `src/lib/stock/` (pure TypeScript, no React/Next/database imports)
- Schema: `src/lib/stock/schema.sql`
- Tests: `src/lib/stock/__tests__/` — `npm test`
- Seed: Afri Gas, TotalEnergies, Rubis across 3 trading branches

---

## 1. The core idea: two ledgers, never one

The bug this design exists to prevent is treating a cylinder as a single number.
It is two facts that move independently:

| Ledger | Table | Question it answers |
| --- | --- | --- |
| **Gas stock** | `inventory_positions` | How much saleable gas is at this branch, per brand/size, filled (`REFILL`) or empty (`EMPTY`)? |
| **Cylinder custody** | `cylinder_custody` | Where are *our* shells right now — at the branch, at the depot, or out with a customer? |

Why they must be separate, in practice:

- A branch can hold 40 filled Total 13 kg cylinders in shells that all belong to
  Total's exchange pool. Gas stock says 40; company assets say 0.
- A branch can own 20 Afri Gas 6 kg shells that are all empty. Assets say 20;
  saleable gas says 0.
- Selling a **refill** moves gas only. Selling a **new cylinder** moves gas *and*
  transfers ownership. Collapsing the two makes one of those two transactions
  wrong, always.

Both ledgers write to **one append-only audit table** (`stock_movements`),
discriminated by `ledger_kind`. So "show me everything that happened to Afri Gas
13 kg at Syokimau" is one query, and balances can be rebuilt from zero by
replaying it — which the tests do.

---

## 2. Reference data

```
categories ──┐
             ├──< product_variants >──┐
brands ──────┘                        │
                                      │
branches ──< inventory_positions >────┤
         └─< cylinder_custody >───────┘
         └─< stock_movements >────────┘
         └─< sales >──< sale_lines >──┘
```

- **Category** carries a `stock_model`: `CYLINDER` (has a REFILL/EMPTY lifecycle)
  or `SIMPLE` (accessories — regulators, hoses). A cylinder operation against a
  `SIMPLE` variant is rejected, which is tested.
- **Brand** carries its `depot_name`, because empties go back to a specific
  brand's depot and exchange schemes never cross brands.
- **Variant** is the intersection: *Afri Gas 13 kg*. It owns `size_kg`,
  `refill_price_ksh` and `deposit_ksh`. `UNIQUE (brand_id, size_kg)` stops a
  duplicate creeping in.
- **Branch** has an `active` flag. Closed branches refuse every operation.

Seeded variants: Afri Gas 3/6/13/50 kg, TotalEnergies 6/13/38 kg,
Rubis 6/13/38 kg, plus two accessories. Branches: Syokimau, Mlolongo, Kitengela
(active), Athi River (closed for refurbishment — deliberately, so the
closed-branch path is testable).

---

## 3. What each operation touches

`+`/`−` are deltas. Blank means the operation provably does not touch that
ledger, which is exactly what the tests assert.

| Command | Gas `REFILL` | Gas `EMPTY` | Custody `BRANCH` | Custody `DEPOT` | Custody `CUSTOMER` |
| --- | --- | --- | --- | --- | --- |
| `purchase(refills, emptiesReturnedToDepot)` | +refills | −returned | +refills −returned | +returned | — |
| `sellRefill(qty, emptiesReceived = 0)` | −qty | +received | — | — | — |
| `sellNewCylinder(qty)` | −qty | — | −qty | — | +qty |
| `sellNewCylinder(qty, transferCylinderOwnership: false)` | −qty | — | — | — | — |
| `exchange(qty)` *(same brand enforced)* | −qty | +qty | — | — | — |
| `returnEmpty(qty)` | — | +qty | — | — | — |
| `returnEmpty(qty, companyOwnedShell: true)` | — | +qty | +qty | — | −qty |
| `returnToDepot(qty)` | — | −qty | −qty | +qty | — |
| `transfer(refills, empties)` | −/＋ at each end | −/＋ at each end | −/＋ at each end | — | — |
| `stocktake(counted)` | Δ | Δ | — | — | — |
| `adjustCustody(counted)` | — | — | Δ | Δ | Δ |

### Mapping real counter events to commands

| What happens at the counter | Command |
| --- | --- |
| Customer hands over an empty, takes a filled one of the same brand/size | `exchange` |
| Customer's own cylinder is filled for them | `sellRefill` |
| Customer buys a cylinder outright, keeps the shell | `sellNewCylinder` |
| Customer drops off a shell (deposit refund, moving house) | `returnEmpty` |
| Depot truck arrives with filled cylinders, takes our empties | `purchase` |
| Our empties go back to the brand | `returnToDepot` |
| Van moves stock from Syokimau to Mlolongo | `transfer` |
| Evening count disagrees with the system | `stocktake` |

**This mapping is decision #1 below** — which of the first two your stations
actually do changes what the till screen calls.

---

## 4. The example from the brief, as a test

`src/lib/stock/__tests__/inventory.test.ts`:

```ts
service.sellRefill({ branchId: SYOKIMAU, variantId: AFRIGAS_13, quantity: 1 }, ctx);
service.returnEmpty({ branchId: SYOKIMAU, variantId: TOTAL_13, quantity: 1 }, ctx);

// Afri Gas 13 kg refills: 23 -> 22
// Afri Gas 13 kg empties: 21 -> 21   (untouched)
// Total 13 kg empties:      9 -> 10
// Total 13 kg refills:     27 -> 27   (untouched)
```

Brand isolation is asserted on all four positions, not just the two that move.

---

## 5. Invariants

**Enforced in the service** (`src/lib/stock/commands.ts`):

1. No position and no custody count ever goes negative.
2. `sellNewCylinder` and `returnToDepot` require enough **company shells at the
   branch** — gas alone is not sufficient. Tested both ways: gas-but-no-shells
   fails, shells-but-no-gas fails.
3. `exchange` refuses a different brand (`BRAND_MISMATCH`), always. A different
   *size* is refused unless the caller explicitly passes
   `allowSizeMismatch: true`.
4. `transfer` refuses the same branch on both ends, and refuses to move zero.
5. Quantities must be whole numbers ≥ 1 (or ≥ 0 where zero is meaningful).
6. `stocktake` requires a reason of at least 5 characters.
7. Cylinder operations refuse `SIMPLE` variants; closed branches refuse
   everything.
8. **Atomicity.** Every command stages its deltas in a `ChangeSet`, validating
   against *projected* balances, and commits at the end. If any step fails,
   nothing was ever written — there is no partial state to roll back. A
   multi-line batch that fails on line 3 leaves lines 1–2 unwritten, and says so
   via `NOT_ATOMIC` carrying the underlying cause. If the failure happens before
   anything was staged, the caller gets the real error instead of a rollback
   wrapper.
9. **Idempotency.** Replaying a command with the same `idempotencyKey` returns
   the original receipt with `replayed: true` and writes nothing. This matters
   because M-Pesa confirmations get retried.
10. **Reconciliation.** `assertLedgerMatchesPositions()` rebuilds both ledgers
    from the audit trail and compares them to live balances. The full-day test
    runs a purchase, a 3-line batch sale, a new-cylinder sale, an exchange, a
    transfer, an empty return, a depot return and a stocktake, then reconciles.

**Enforced in PostgreSQL** (`schema.sql`, so a hand-run query can't corrupt it):

- `CHECK (quantity >= 0)` on both ledgers.
- Primary keys make a position one row per (branch, variant, state).
- `movement_balance_consistent`: `balance_after = balance_before + quantity`.
- `movement_ledger_shape`: a gas row must have a state and no custody, a
  cylinder row the reverse.
- `movement_no_self_counterparty`: a transfer cannot be recorded against itself.
- `char_length(trim(reason)) >= 5` on every movement.
- **Append-only trigger**: `UPDATE` and `DELETE` on `stock_movements` raise.
  Corrections are new movements, never edits.
- Partial unique index on `(idempotency_key, branch_id, variant_id,
  movement_slot)` — one command may write several rows, but never the same row
  twice.
- Variant shape trigger: cylinder variants need a positive `size_kg`,
  accessories must not have one.

---

## 6. Decisions to review before we build screens

1. **Which command is a counter sale?** Swap (`exchange`) or on-site fill
   (`sellRefill`)? Most Kenyan stations swap; some decant. This decides the
   button labels and whether every sale creates an empty.
2. **Customer-owned shells.** Right now a customer's shell left at the counter
   appears in `EMPTY` but not in the custody register, which counts company
   assets only. Do you want a per-owner dimension on the gas ledger instead?
3. **Deposits.** `deposit_ksh` exists on the variant but there is no deposit
   ledger. If deposits are refundable liabilities, they need their own table and
   movements — not a number on the variant.
4. **Bulk tanks.** Everything here is cylinder-counted. If any branch decants
   from a bulk tank, we need a kg-denominated stock entity alongside cylinders.
5. **Per-branch pricing.** Price currently lives on the variant. If Syokimau and
   Kitengela charge differently, it moves to a `(branch, variant, effective_from)`
   price table.
6. **Cylinder serials.** Custody is counted, not serialised. If you want QR or
   barcode tracking per cylinder, that's an asset register with its own
   movements — a meaningful addition, worth deciding now.
7. **Negative stock policy.** Hard-blocked everywhere. Some operations teams
   prefer "allow the sale, flag the deficit, correct at stocktake". Say the word
   and it becomes a per-branch setting.
8. **Actor identity.** `actor` is a plain string today. It becomes a user id once
   authentication exists; the audit table already has the column.

---

## 7. What I changed about the brief

You asked for categories, brands, variants, branch inventories, REFILL/EMPTY,
auditable movements, correct handling of purchases/sales/exchanges/transfers,
separation of cylinder ownership from gas stock, and tests. All in. Additions I
made on my own initiative, each because something broke without it:

- **Two ledgers instead of one "stock" table with an owner column.** A single
  table forces you to choose between gas and asset truth on every row.
- **One append-only audit table for both ledgers**, with a `ledger_kind`
  discriminator — one query answers "what happened here".
- **Staged change sets** for real atomicity, rather than try/catch rollback of
  writes that already happened.
- **Idempotency keys**, because payment retries are a daily reality, not an edge
  case.
- **Stocktake as the only correction path**, with a mandatory reason.
- **`IN_TRANSIT` and `DEPOT` custody states**, not just ours/theirs — transfers
  and depot returns need somewhere to put the shells.
- **Accessories as a second category**, to prove the model isn't accidentally
  cylinder-only.
- **A closed branch in the seed**, so the closed-branch path is covered.
- **The SQL schema executed against a real PostgreSQL engine in tests** rather
  than written and hoped for.

---

## 8. Running it yourself

```bash
npm install

npm test                 # all 104 tests
npm run test:stock       # the stock domain only
npx vitest run src/lib/stock/__tests__/schema.test.ts   # schema vs real Postgres
npx vitest run -t "returning a Total 13 kg empty"       # the example from the brief

npx tsc --noEmit         # typecheck
npm run lint             # ESLint
npm run build            # Next.js production build
```

`schema.test.ts` boots **PostgreSQL 18.3** in WebAssembly via PGlite, applies
`schema.sql`, and asserts the constraints and triggers actually fire. No
external database needed.

### Test inventory — 104 tests, 8 files

| File | Tests | Covers |
| --- | --- | --- |
| `catalog.test.ts` | 14 | Categories, brands, variants, duplicate codes, variant shape rules |
| `inventory.test.ts` | 11 | The brief's example, brand/size/branch isolation, purchases, kg and value |
| `ownership.test.ts` | 11 | Gas vs cylinder separation, both failure directions, depot returns |
| `exchange.test.ts` | 6 | Like-for-like, cross-brand rejection, size mismatch and its override |
| `transfer.test.ts` | 9 | Both states move, conservation, same-branch, insufficient, closed branch |
| `invalid-operations.test.ts` | 25 | Unknown entities, bad quantities, oversell, accessories, reasons — each asserting nothing was written |
| `transactions.test.ts` | 9 | Batch atomicity, rollback, idempotency, audit chain, full-day reconciliation |
| `schema.test.ts` | 19 | DDL, CHECKs, primary keys, append-only trigger, idempotency index, reporting view |

---

## 9. Deliberately not built

- Any UI. The dashboard at `/` still renders its own sample data
  (`src/lib/data.ts`) and does **not** use this module yet.
- No persistence wiring: `StockService` is in-memory. A Postgres-backed
  repository implementing the same surface is the next step after this review.
- No authentication, so `actor` is trusted input.
- No reports or exports.
