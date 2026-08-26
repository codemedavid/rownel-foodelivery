# TDD Evidence Report — Expo Customer Ordering App

**Date:** 2026-08-26
**Branch:** `feat/expo-customer-app`
**Source plan:** Inline `/ecc:plan` output (confirmed by user with "proceed"); no `*.plan.md` artifact. User journeys were derived during this TDD run from the approved plan.

## User journeys

1. As a customer, I want to browse all merchants and their full menus, so I can find what to order.
2. As a customer, I want to customize an item (size/variations, add-ons, quantity) and see the price update, so I know what I'll pay.
3. As a customer, I want to check out as a guest with just my name and phone number, so I can order without an account.
4. As a customer, I want my order saved correctly (including delivery mode) so the restaurant receives it.

## Task report

| Task | Summary | Validation command | Result |
|---|---|---|---|
| Scaffold | Expo SDK 57 + expo-router + supabase-js + jest-expo in `mobile/` | `npx expo export --platform android` | Bundle produced (3.3MB hbc) |
| Cart logic | Ported web `useCart` pricing/merging as pure immutable functions | `npx jest` (mobile/) | RED then GREEN |
| Row mappers | merchants/menu_items snake_case → camelCase incl. discount window + flat-variation group assembly | `npx jest` | RED then GREEN |
| Checkout logic | Guest form validation (PH phone), order/order_items insert rows, NOT-NULL `delivery_mode` default | `npx jest` | RED then GREEN |
| Screens | Home, merchant, item, cart, checkout, confirmation (Grab/FoodPanda style) | `npx tsc --noEmit` + Metro export | Clean / OK |

## RED/GREEN evidence

- **RED (commit `test: add failing reproducers…`)**: `npx jest` in `mobile/` — 3 suites failed with `Cannot find module './cart' | './mappers' | './checkout'` (missing implementation; tests compiled and executed).
- **GREEN (commit `feat: implement mobile cart, mapper, and checkout logic…`)**: `npx jest` — 3 suites, 32/32 pass.
- **Second cycle (commit `fix: assemble variation groups from flat DB variations…`)**: new mapper test failed 1/7 (RED), then 33/33 pass (GREEN) after grouping flat variations by `variation_group` name to match the real DB shape.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | Item price = effective (discounted) price + variations + add-on qty | `src/lib/cart.test.ts` | unit | PASS |
| 2 | Adding identical selections merges lines; different selections split; no mutation | `src/lib/cart.test.ts` | unit | PASS |
| 3 | Quantity 0 removes the line; totals/counts sum correctly | `src/lib/cart.test.ts` | unit | PASS |
| 4 | Merchant rows map snake_case → camelCase (fees, imagery, minimums) | `src/lib/mappers.test.ts` | unit | PASS |
| 5 | Discount window (start/end dates) drives effectivePrice/isOnDiscount | `src/lib/mappers.test.ts` | unit | PASS |
| 6 | Variation groups assemble from nested OR flat DB shape, sorted | `src/lib/mappers.test.ts` | unit | PASS |
| 7 | Tracked-inventory items with available=false are auto-disabled | `src/lib/mappers.test.ts` | unit | PASS |
| 8 | Name/PH-phone validation; address required only for delivery | `src/lib/checkout.test.ts` | unit | PASS |
| 9 | delivery_mode is always concrete (NOT-NULL column protection) | `src/lib/checkout.test.ts` | unit | PASS |
| 10 | Order insert row has no `undefined` values; optionals → null | `src/lib/checkout.test.ts` | unit | PASS |
| 11 | order_items rows carry variation/add_ons JSON + correct subtotals | `src/lib/checkout.test.ts` | unit | PASS |

Full run: `cd mobile && npx jest` → **Test Suites: 3 passed, Tests: 33 passed**.

## Coverage

`npx jest --coverage` (scope: `src/lib/**`, excluding the supabase client factory):

```
All files    |   96.34 |    72.37 |   90.62 |   95.83
 cart.ts     |      95 |    86.95 |   88.23 |   94.28
 checkout.ts |     100 |       92 |     100 |     100
 mappers.ts  |   94.73 |    60.18 |   88.88 |   93.33
```

Statements/lines exceed the 80% target. Branch coverage in `mappers.ts` (60%) is dominated by per-column `?? null / ?? undefined` fallbacks; the behavioral branches (discount window, group assembly, availability) are all covered.

## Known gaps / follow-ups

- **Screens and hooks are not unit-tested.** React Native component tests (@testing-library/react-native) and E2E (Detox/Maestro) were deferred; screens were verified by `tsc --noEmit` and a full Metro export (`expo export --platform android`), not by rendering tests.
- **Live order insert not exercised** against Supabase RLS from the mobile client; the payload matches the web app's working insert path byte-for-byte, but a manual smoke test on device is recommended.
- Delivery fee uses the merchant's flat `delivery_fee`; distance-based pricing (`deliveryPricing.ts`) and the map location picker are follow-ups.
- Receipt upload (ImageKit) deferred; reference-number field only.

## Merge evidence

If checkpoint commits are squashed, preserve: RED = 3 suites "Cannot find module" → GREEN 32/32 → second cycle RED 1/7 → GREEN 33/33 → coverage 96.34% statements.
