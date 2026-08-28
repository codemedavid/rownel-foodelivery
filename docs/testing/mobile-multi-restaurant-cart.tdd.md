# TDD Evidence — Multi-Restaurant Cart on Mobile

**Source plan**: inline plan produced by `/ecc:plan` in this session (not saved as a `*.plan.md`).
**Scope**: port the web app's multi-merchant basket and checkout algorithm
(`src/components/Cart.tsx`, `src/components/Checkout.tsx`) to the Expo app.

## User Journeys

1. As a customer, I want to add items from a second restaurant without losing my
   first restaurant's items, so that I can order from several places in one go.
2. As a customer, I want each restaurant in my basket shown separately with its own
   subtotal and minimum-order status, so that I know what is blocking checkout.
3. As a customer, I want to pay one delivery fee for the whole basket, so that
   ordering from two nearby restaurants is not double-charged.
4. As a customer, I want each restaurant to receive its own order, so that every
   kitchen only sees what it has to cook.
5. As a customer, if one restaurant's order fails, I want the successful ones to
   stay placed and only the failed ones to remain in my basket.

## Task Report

### Task 1 — Cart algebra (`mobile/src/lib/cart.ts`)
Added merchant-prefixed `lineId` plus `groupCartByMerchant`, `getCartMerchantIds`,
`getMerchantSubtotal`, `removeMerchantLines`; `addToCart` no longer needs any
single-merchant assumption.

- **Validation**: `npm test` (mobile)
- **RED**: `TypeError: (0 , _cart.groupCartByMerchant) is not a function` and
  siblings — 7 new cart tests failing.
- **GREEN**: `src/lib/cart.test.ts` PASS.
- **Guarantees**: adding from a new merchant appends rather than resets; identical
  item ids across merchants get distinct line ids; grouping preserves the order
  merchants were first added; per-merchant subtotal ignores other merchants;
  removing a merchant is immutable.

### Task 2 — Delivery quotes (`mobile/src/lib/deliveryQuotes.ts`, new)
Per-merchant distance quote with flat-fee fallback, plus primary-merchant
selection and the single basket fee.

- **Validation**: `npm test`
- **RED**: whole suite failed to run — `Cannot find module './deliveryQuotes'`.
- **GREEN**: `src/lib/deliveryQuotes.test.ts` PASS (12 tests).
- **Guarantees**: distance-based fee when both coordinates are known; falls back to
  the merchant flat fee (flagged `isEstimate`) when the user or merchant has no
  coordinates, never a misleading ₱0; merchants beyond `maxDeliveryDistanceKm` are
  undeliverable with a reason; fee clamped to min/max; economy mode honours
  `fixedDeliveryFee`; the primary merchant is the highest deliverable fee and
  undeliverable merchants are ignored; unknown merchant ids do not throw.

### Task 3 — Order split (`mobile/src/lib/checkout.ts`)
`buildMerchantOrderInputs` splits a basket into one `create_order` payload per
merchant.

- **Validation**: `npm test`
- **RED**: `TypeError: (0 , _checkout.buildMerchantOrderInputs) is not a function`.
- **GREEN**: `src/lib/checkout.test.ts` PASS.
- **Guarantees**: one payload per merchant carrying only that merchant's lines; the
  delivery fee lands only on the primary merchant and every other order is charged
  0; each order keeps its own `distanceKm`; pickup orders send `deliveryFee: null`
  and `address: null`; no payload contains `undefined`; empty basket → empty list.
- **Spec correction during GREEN**: one assertion originally expected
  `deliveryFee === 0` for pickup. `buildCreateOrderInput` maps an absent fee to
  `null` (existing, tested contract), so the test was corrected to expect `null`.
  The implementation was not bent to fit the test.

### Task 4 — UI wiring (`CartContext`, cart screen, checkout screen, `BasketBar`)
No automated coverage — `@testing-library/react-native` cannot resolve
`test-renderer` in this install (pre-existing, see Known Gaps). Verified by
`npx tsc --noEmit` and by the pure-logic tests the screens delegate to.

- **Validation**: `npx tsc --noEmit` → exit 0.

## Test Specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | Adding from a second restaurant keeps the first restaurant's lines | `src/lib/cart.test.ts:keeps lines from other merchants when adding a new merchant` | unit | PASS | `npm test` |
| 2 | Same item id at two restaurants never merges into one line | `src/lib/cart.test.ts:gives lines with the same item id from different merchants distinct line ids` | unit | PASS | `npm test` |
| 3 | Lines group by restaurant in the order restaurants were added | `src/lib/cart.test.ts:groups lines by merchant preserving insertion order` | unit | PASS | `npm test` |
| 4 | A restaurant's subtotal counts only its own lines | `src/lib/cart.test.ts:sums the subtotal for a single merchant only` | unit | PASS | `npm test` |
| 5 | Removing a restaurant drops only its lines, immutably | `src/lib/cart.test.ts:removes every line belonging to one merchant immutably` | unit | PASS | `npm test` |
| 6 | Delivery fee is distance-based when coordinates are known | `src/lib/deliveryQuotes.test.ts:quotes a distance-based fee when both coordinates are known` | unit | PASS | `npm test` |
| 7 | Missing coordinates fall back to the flat fee, flagged as an estimate | `src/lib/deliveryQuotes.test.ts:falls back to the merchant flat delivery fee when the user location is unknown` | unit | PASS | `npm test` |
| 8 | Restaurants beyond their max distance are undeliverable with a reason | `src/lib/deliveryQuotes.test.ts:marks the merchant undeliverable beyond its maximum delivery distance` | unit | PASS | `npm test` |
| 9 | The basket pays one fee — the furthest deliverable restaurant's | `src/lib/deliveryQuotes.test.ts:picks the merchant with the highest deliverable fee` | unit | PASS | `npm test` |
| 10 | Undeliverable restaurants never become the fee-bearing restaurant | `src/lib/deliveryQuotes.test.ts:ignores undeliverable merchants when choosing the primary` | unit | PASS | `npm test` |
| 11 | One `create_order` payload is built per restaurant | `src/lib/checkout.test.ts:builds one order payload per merchant in the basket` | unit | PASS | `npm test` |
| 12 | Only the primary restaurant's order carries the delivery fee | `src/lib/checkout.test.ts:charges the delivery fee only on the primary (furthest) merchant order` | unit | PASS | `npm test` |
| 13 | Each order records its own distance even when not primary | `src/lib/checkout.test.ts:carries each merchant own distance even when it is not the primary` | unit | PASS | `npm test` |
| 14 | Pickup orders send no fee and no address | `src/lib/checkout.test.ts:sends no delivery fee at all for pickup orders` | unit | PASS | `npm test` |
| 15 | No payload ever contains `undefined` | `src/lib/checkout.test.ts:never emits undefined values in any payload` | unit | PASS | `npm test` |

## Coverage

`npm run test:coverage` (mobile, `collectCoverageFrom: src/lib/**`):

```
All files            |   96.77 |    79.26 |   91.42 |   96.93
 cart.ts             |   96.15 |    88.88 |   91.66 |   95.65
 checkout.ts         |     100 |    90.62 |     100 |     100
 deliveryQuotes.ts   |   93.47 |    89.74 |   72.72 |   93.18
```

Every file touched by this work is at or above the 80% branch target. The 79.26%
aggregate branch figure is pulled down by pre-existing `mappers.ts` (60.18%),
which this change does not touch.

Final run: **83 passed / 83 total**, `npx tsc --noEmit` exit 0.

## Known Gaps

- **`src/context/LocationContext.test.tsx` does not run** — `Cannot find module
  'test-renderer'` from `@testing-library/react-native`. Verified pre-existing:
  the same failure reproduces on a clean `git stash` of this branch. Consequence:
  no component-level tests for the cart or checkout screens; their logic is
  covered through the pure `src/lib` functions they call.
- **Opening-hours gating not ported.** The web blocks checkout when a merchant is
  closed (`src/lib/timeUtils.ts:isMerchantOpen`); mobile has no `timeUtils` port,
  so only minimum-order and delivery-range gating are enforced. Deliberately out
  of scope, agreed in the plan.
- **Merchant-specific payment methods not ported.** The web hides merchant-scoped
  payment methods for multi-merchant baskets; mobile hardcodes three methods, so
  no behavior differs today.
- **Multi-order placement is not atomic.** There is no transaction spanning the
  per-merchant `create_order` calls (same exposure as the web app). Mitigated on
  mobile by removing successfully-ordered restaurants from the basket and telling
  the customer exactly what was and was not placed — an improvement over web.

## Checkpoint Commits

| Stage | Commit | Evidence |
|---|---|---|
| RED | `944e552` `test: add failing specs for multi-restaurant baskets on mobile` | 12 failing tests + missing `deliveryQuotes` module |
| GREEN (lib) | `123ca2e` `feat(mobile): multi-restaurant cart algebra, delivery quotes, order split` | 83/83 pass |
| GREEN (UI) | `fd0e95a` `feat(mobile): order from several restaurants in one basket` | 83/83 pass, `tsc --noEmit` clean |
