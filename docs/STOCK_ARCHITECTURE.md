# Gateway Gas Enterprises — Stock & Sales Architecture

Status: **reviewed with the owner, answers applied.** Schema + tests only, no UI yet.
144 tests pass. Everything below is implemented in `src/lib/stock/` and verified by
`src/lib/stock/__tests__/`.

---

## 1. The one rule that shapes everything: two ledgers

Gas and cylinders are different things that happen to arrive in the same object.
They are recorded in two ledgers that are **never merged and never summed together**:

| Ledger | Table | Question it answers |
|---|---|---|
| **Gas stock** | `inventory_positions` | How much saleable gas is at this location, per brand and size — filled (`REFILL`) or empty (`EMPTY`)? |
| **Cylinder custody** | `cylinder_custody` | Where are *our own shells* right now — standing here (`BRANCH`), at the depot (`DEPOT`), out with a customer (`CUSTOMER`), or in transit (`IN_TRANSIT`)? |

Why this matters:

- Syokimau can hold 40 filled Total 13 kg cylinders whose shells all belong to the
  branch — gas 40, custody 40.
- Syokimau can own 20 Afri Gas 6 kg shells that are all empty — custody 20, gas 0.
- A customer can walk off with a filled 13 kg in a shell we no longer hold — gas
  leaves, custody moves from `BRANCH` to `CUSTOMER`, and nothing is created.

Every operation writes both ledgers or explicitly writes neither. A test
(`ownership.test.ts`) asserts that selling a cylinder moves custody and that an
exchange does not.

## 2. Locations: branches **and** rider vans

Most sales happen when the rider reaches the customer, not over the counter. So a
`StockLocation` is either:

- `BRANCH` — a fixed trading point. Has no home location, no rider.
- `VAN` — a rider's vehicle. **Must** have a `homeLocationId` and a `rider`.

A van is a real stock-holding location, deliberately. If the rider's load were only
a note on the branch's record, the branch count would drop when the van left and
nobody could say what was on the road. Loading a van is an ordinary
`transfer(branch → van)`; the night's reconciliation is
`transfer(van → branch)` with the unsold refills and the collected empties.

Seeded: `van-01` (Brian O., home Syokimau) and `van-02` (Amina S., home Mlolongo).
Both start empty and are loaded by transfer.

The registry refuses a van with no branch, a van with no rider, and a branch that
claims a home location — enforced identically in `LocationRegistry` and as SQL CHECK
constraints (`van_needs_branch_and_rider`, `branch_has_no_home`).

## 3. Channel: how the sale happened

Every sale and every sale-producing movement carries a `channel`:
`WALK_IN`, `DELIVERY`, or `INTERNAL` for non-sale movements. It defaults by location
— `DELIVERY` at a van, `WALK_IN` at a branch — and can be stated explicitly.

## 4. Exchange: any brand, same size

The earlier "same brand only" rule was **wrong** and has been removed. Customers hand
over whatever empty they have, so:

- **Cross-brand is allowed.** Give a filled Afri Gas 13 kg, take back a Total 13 kg.
- **The size must match.** Different size only with an explicit
  `allowSizeMismatch: true` override, which is rare and shows up in the audit trail.
- **The incoming empty is booked against its own variant.** A Total 13 kg empty
  coming in during an Afri Gas sale increases **Total** 13 kg empties by one, not
  Afri Gas — that is the exact test the brief asked for, and it passes.
- An exchange is a **gas** operation. Custody does not move: the customer keeps a
  shell either way.

A foreign-brand empty collected at our counter or in the van can then go back to
*that brand's* depot with `returnToDepot` — never into our own brand's count.

## 5. No deposits

There are no deposits in this business. Customers are not charged for the cylinder,
not charged for the exchange, and not charged when they are left holding the
cylinder. Accordingly:

- `deposit_ksh` has been **removed from the schema and the domain** entirely
  (a schema test asserts no column matching `%deposit%` exists anywhere).
- `sellWithCylinder` (formerly `sellNewCylinder`) moves gas **and** custody
  `BRANCH → CUSTOMER`, and charges gas only.
- No deposit ledger, no liability table, nothing to reconcile.

## 6. Cylinder count = refills + empties

"How many 13 kg Afri Gas cylinders are standing here?" counts a cylinder whether it
is full or empty:

```
3 × 13 kg Afri Gas REFILL  +  4 × 13 kg Afri Gas EMPTY  =  7 cylinders
```

Exposed as `service.cylinderCount(locationId, variantId)`, as
`VariantPosition.cylinders`, and in SQL as the `v_cylinder_counts` view. An exchange
keeps the count steady (one filled leaves, one empty arrives); a refill sale with no
empty returned reduces it by one.

## 7. Pricing: list vs charged, and the reason for the gap

Prices move — regulars get a rate, hotels get another. That is fine. What is not fine
is a silent price. So:

- Each variant has a `list_price_ksh`. Omitting a price on a sale **charges list**.
- `SalePricing` is fully optional: `{ unitPriceKsh, discountReason, ... }`.
- **Any** deviation from list — up or down — requires a reason of at least
  `MIN_PRICE_REASON_LENGTH` (5) characters. Otherwise `InvalidPriceError`, and
  nothing is written: prices are validated for every line **before** any stock is
  touched.
- Zero and negative prices are refused outright.
- Every sale line records `listPriceKsh`, `unitPriceKsh`, `listTotalKsh`,
  `chargedTotalKsh` and `discountReason`. The sale carries `listTotalKsh`,
  `chargedTotalKsh` and `discountKsh = listTotalKsh − chargedTotalKsh`.
- Discounts are one query away: `service.sales.discounted()` and
  `service.sales.totalDiscountKsh()`, backed in SQL by a partial index on
  `sale_lines(discount_reason IS NOT NULL)` and a CHECK constraint
  `price_deviation_needs_reason`.

## 8. Actor: who did it

`actor` is the person responsible for the command — the cashier, the rider, whoever
signed for the delivery note. Right now it is a **free-text string** passed in the
command context; `metaFor()` refuses anything shorter than two characters with
`InvalidActorError`, and the SQL layer has the same CHECK.

**This is the one gap worth flagging before the UI is built.** A typed-in name is
not identity: it can be mistyped, copied, or written by somebody else. The plan is to
replace it with a login — a `users` table, a session, and the actor derived from the
authenticated user rather than typed at the till. The audit column already exists and
every movement and sale already writes it, so the switch is a source-of-truth change,
not a schema change.

## 9. Operations

| Operation | Gas ledger | Custody ledger |
|---|---|---|
| `purchase` | REFILL in, optional EMPTY to depot | DEPOT → BRANCH |
| `sellRefill` | REFILL out, optional EMPTY in | — |
| `exchange` | REFILL out + EMPTY in (any brand, same size) | — |
| `sellWithCylinder` | REFILL out | BRANCH → CUSTOMER |
| `returnEmpty` | EMPTY in | optional CUSTOMER → BRANCH |
| `returnToDepot` | EMPTY out | BRANCH → DEPOT |
| `transfer` | both states move between locations | moves with them |
| `stocktake` / `stocktakeMany` | corrected to the counted quantity | — |
| `adjustCustody` | — | corrected to the counted shells |
| `sellMany` | one ticket, many lines, one location | as per line |

## 10. Guarantees the code enforces

1. **Never negative.** Selling more than a location holds is refused. The owner's
   reason stands: allowing it produces garbage that looks like a posting error.
2. **All or nothing.** `sellMany` validates every line — quantities *and* prices —
   before staging a single unit. If one line fails, the batch throws and nothing at
   all is written; no sale row is created either.
3. **Append-only audit.** Every movement records `balanceBefore` / `balanceAfter`,
   the reason, the reference, the actor and the channel. A SQL trigger refuses
   `UPDATE` and `DELETE`. Corrections are new movements.
4. **Idempotent.** An `idempotencyKey` (e.g. an M-Pesa code) makes a retried command
   replay the original receipt — including the sale it created — instead of
   double-posting. Backed by a partial unique index on
   `(idempotency_key, location_id, variant_id, movement_slot)`.
5. **Reconcilable.** `assertLedgerMatchesPositions()` rebuilds every position from
   the ledger alone and compares. It runs at the end of the mixed-trading test.
6. **Custody checked per operation**, not by a blanket invariant. An exchange can
   only return what a customer holds; a depot return can only send what stands here.

## 11. Seed data

Categories `LPG-CYL` (CYLINDER) and `ACC` (SIMPLE). Brands **Afri Gas**,
**TotalEnergies**, **Rubis**.

| Variant | List price (KSh) |
|---|---|
| 3 kg (Afri Gas) | 550 |
| 6 kg | 1,050 · Total 1,080 |
| 13 kg | 2,350 · Total 2,400 |
| 38 kg | 6,450 · Rubis 6,400 |
| 50 kg (Afri Gas) | 8,450 |
| Regulator / hose | 1,200 / 450 |

Locations: **Syokimau (SYK)**, **Mlolongo (MLO)**, **Kitengela (KTG)**,
**Athi River (ATR, inactive** — so the closed-location path is tested),
plus vans **VAN-01** and **VAN-02**.

Opening balances are written through `stocktakeMany` + `adjustCustody` under the
reference `SEED-OPEN`, so the ledger reconciles from zero rather than being seeded
as a fact. Syokimau carries the full range; Mlolongo and Kitengela carry a subset;
the vans start empty.

## 12. Tests

```
npm ci
npx vitest run
```

| File | Tests | Covers |
|---|---|---|
| `catalog.test.ts` | 17 | categories, brands, variants, list prices, no deposit, location registry incl. vans |
| `inventory.test.ts` | 14 | The brief's example, isolation by brand/size/location, purchases, kg, value, cylinder counts |
| `ownership.test.ts` | 11 | Custody moves independently of gas; shells with customers |
| `exchange.test.ts` | 7 | Cross-brand allowed, size enforced, foreign empties booked to their own brand |
| `transfer.test.ts` | 9 | Both states move, conservation, same-location refusal, insufficient stock, closed location |
| `transactions.test.ts` | 9 | Atomic batches, idempotency, audit chain, full-day reconciliation |
| `riders.test.ts` | 7 | Load the van, sell at the door, reconcile at night, what is on the road |
| `pricing.test.ts` | 11 | List by default, discounts with reasons, refusal without one, visibility |
| `invalid-operations.test.ts` | 29 | Every refusal path, including attribution |
| `schema.test.ts` | 30 | The DDL against a real PostgreSQL engine (PGlite): constraints, triggers, views |
| **Total** | **144** | |

`schema.test.ts` runs the actual `schema.sql` inside PGlite (PostgreSQL compiled to
WebAssembly), so the constraints and triggers are proven against a real server, not
mocked.

## 13. Deliberately not built yet

1. **Cylinder serials.** Agreed for later. When they come, custody becomes per-shell
   rather than per-count, and `cylinder_custody` gains a `cylinder_id` dimension.
2. **Login / real actor identity.** See §8.
3. **Per-location pricing.** Price lives on the variant. If branches charge
   differently it moves to `(location, variant, effective_from)`.
4. **Bulk tanks / decanting.** Everything here is cylinder-counted.
5. **The UI.** Waiting on the sign-off of this document.
