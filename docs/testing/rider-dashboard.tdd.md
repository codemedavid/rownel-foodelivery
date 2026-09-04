# TDD Evidence: Rider Dashboard (mobile)

**Source plan**: inline plan approved in-session (no `*.plan.md` artifact).
**Branch**: `feat/catalog-image-sourcing`
**Checkpoints**: `9318886` (RED) → `9ea91ae` (GREEN) → `09435ae` (migration) → `2be9078` (feature)

## User journeys

1. As a rider, I want to land on my own dashboard when I sign in, so I never see the customer storefront.
2. As a rider, I want to go online only when GPS is actually live, so I don't get offers I can't serve.
3. As a rider, I want new offers to appear instantly with a visible countdown, so I can accept before they expire.
4. As a rider, I want to be alerted even when the app is backgrounded, so I don't miss orders.
5. As a rider, I want to navigate, mark picked-up and mark delivered, so each delivery is tracked end to end.
6. As a rider, I want to see my earnings and payouts, so I can track what I'm owed.

## Pre-implementation risk gates

Both HIGH risks from the plan were checked against the live Supabase project **before** any code was written:

| Gate | Query | Result |
|---|---|---|
| Riders carry `app_metadata.role = 'rider'` (otherwise `deriveRoleContext` would treat them as customers) | `riders` joined to `auth.users` | `app_role = 'rider'` — routing works as designed, **no fallback needed** |
| RLS lets a rider read their own offers/presence/profile/payouts/notifications | `pg_policies` | All five policies already present — **no new policies needed** |

RPC signatures for all 8 rider functions were verified against `pg_proc` before the API layer was written, so parameter names (`p_online`, `p_latitude`/`p_longitude`, `p_permission`, `p_offer_id`, `p_order_id`) are confirmed, not assumed.

## Task report

### 1. Pure domain layer (RED → GREEN)

Tests written first and executed to a valid RED before any implementation.

```
npx jest src/lib/{offerFilters,riderActions,mapsLink,riderMappers,roles,pushRouting}.test.ts
RED  -> Test Suites: 6 failed, 6 total | Tests: 5 failed, 16 passed
        Cannot find module './offerFilters'  (compile-time RED)
        Cannot find module './riderActions'  (compile-time RED)
        Cannot find module './mapsLink'      (compile-time RED)
        Cannot find module './riderMappers'  (compile-time RED)
        landingRouteFor('rider') -> '/(tabs)', expected '/(rider)'   (runtime RED)
        groupForRole / canAccessRiderTab is not a function            (runtime RED)
        parseNotificationRoute rider -> '/order/o1', expected '/(rider)/delivery/o1'
GREEN -> Test Suites: 6 passed, 6 total | Tests: 49 passed
```

### 2. Order coordinates (RED → GREEN)

`buildMapsUrl` needed `deliveryLatitude`/`deliveryLongitude`, which the DB has but the mobile `Order` type lacked. Caught by `tsc`, then driven by test:

```
npx jest src/lib/adminMappers.test.ts
RED  -> expect(order.deliveryLatitude).toBe(14.5995) | Received: undefined
GREEN -> Tests: 7 passed
```

### 3. Three-way role routing (RED → GREEN)

The redirect decision was extracted from `RoleGate` into the pure `redirectTargetFor()` so it is testable:

```
npx jest src/lib/roles.test.ts
RED  -> TypeError: redirectTargetFor is not a function  (x4 cases)
GREEN -> Tests: 20 passed
```

### 4. Rider offer notifications (database)

Applied via the Supabase MCP (the CLI is unavailable for this account) and committed to `supabase/migrations/20260905000000_rider_offer_notifications.sql`.

Verified against the live project by inserting a real pending offer:

```
title: "New delivery offer 🛵"
body:  "Jollibee Balaoan · #362D41CE · 2.4 km · ₱51.74"
data:  {"target":"rider","offerId":"…","orderId":"…","expiresAt":"…"}
recipient_user_id: d201487c…  (the rider)
```

Test rows were then deleted (`notifications_deleted: 1, offers_deleted: 1`).

### 5. Supabase wrapper integration tests (added after implementation)

`src/lib/riderApis.test.ts` was written **after** the wrappers, not RED-first — it is a characterization suite. Its value is pinning table names, filters and RPC parameter names, which fail silently at runtime rather than at compile time. Stated plainly so the RED/GREEN record above is not overclaimed.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | An expired or non-pending offer never shows, and live offers sort soonest-first | `src/lib/offerFilters.test.ts` | unit | PASS |
| 2 | The expiry countdown rounds up and never goes negative | `src/lib/offerFilters.test.ts` | unit | PASS |
| 3 | A rider is offered `pickup` only on `ready` and `deliver` only on `out_for_delivery` | `src/lib/riderActions.test.ts` | unit | PASS |
| 4 | Going online is refused without granted permission **and** a real fix | `src/lib/riderActions.test.ts` | unit | PASS |
| 5 | A location fix older than 60s counts as stale | `src/lib/riderActions.test.ts` | unit | PASS |
| 6 | Navigation prefers coordinates, falls back to an encoded address, and returns null with neither | `src/lib/mapsLink.test.ts` | unit | PASS |
| 7 | `openDirections` reports failure instead of throwing when no maps app handles the URL | `src/lib/mapsLink.test.ts` | unit | PASS |
| 8 | Offer/presence/payout/earnings rows convert to camelCase + epoch ms, tolerating nulls and numeric strings | `src/lib/riderMappers.test.ts` | unit | PASS |
| 9 | A signed-in rider is redirected out of `(tabs)`/`(admin)` into `/(rider)` | `src/lib/roles.test.ts` | unit | PASS |
| 10 | Deep links (`order`, `merchant`, `item`, `checkout`, `notifications`) are never hijacked by the role gate | `src/lib/roles.test.ts` | unit | PASS |
| 11 | A `target: 'rider'` push opens `/(rider)/delivery/<id>` | `src/lib/pushRouting.test.ts` | unit | PASS |
| 12 | Offers are queried scoped to the rider, pending, and unexpired | `src/lib/riderApis.test.ts` | integration | PASS |
| 13 | Presence RPCs are called with the parameter names the database declares | `src/lib/riderApis.test.ts` | integration | PASS |
| 14 | Active deliveries exclude completed/cancelled; history is bounded and newest-first | `src/lib/riderApis.test.ts` | integration | PASS |
| 15 | A failed query surfaces the postgres error message rather than failing silently | `src/lib/riderApis.test.ts` | integration | PASS |
| 16 | Order rows carry delivery and merchant coordinates | `src/lib/adminMappers.test.ts` | unit | PASS |
| 17 | Inserting a pending `order_offers` row notifies the rider and enqueues push | live Supabase verification (§4) | integration | PASS |

## Coverage

```
npx jest --coverage
Test Suites: 26 passed, 26 total
Tests:       220 passed, 220 total
All files:   72.62% stmts | 65.98% branch | 75.58% funcs | 76.12% lines
             (was 64.01% / 60.83% / 65.72% / 66.51% before this work)
```

Per new module: `offerFilters` 100%, `riderActions` 100%, `riderMappers` 100%, `mapsLink` 100%, `roles` 95%, rider API wrappers 71–87%, `riderTypes` 0% (declarations only, no runtime code).

## Known gaps and follow-ups

- **Below the 80% global bar (72.62%).** The shortfall is pre-existing, not introduced here: every `*Api.ts`, `notifications.ts` and `statusColors.ts` in the repo was already at 0%. This work moved the number up 8.6 points. Raising the rest means testing the *admin* wrappers, which is out of scope for this task.
- **No E2E tests.** The repo has no E2E harness (no Playwright/Detox, and Expo Router screens are not currently rendered in tests). Journeys 1–6 are covered at the unit/integration level plus the live database verification; a device pass is still needed.
- **Foreground-only GPS.** `useRiderLocation` uses `watchPositionAsync`, so a backgrounded app stops sending fixes and presence goes stale, dropping the rider from the dispatch radius. The offer push still arrives (§4). Background location via `expo-task-manager` is a deliberate follow-up. The UI warns: *"Last fix … — keep the app open"*.
- **Chat and the live map were descoped** by explicit decision; the `order_messages` RPCs remain unused by mobile.
- **Untracked edit not authored here.** `src/hooks/useStaffOrderAlerts.ts` was modified during the session by something other than this work (it was clean at session start). It was deliberately **left uncommitted**. The bug it addresses is real — a re-subscribe in the same tick can throw *"tried to subscribe multiple times"* — so the equivalent hardening (unique `channelSeq` topic + options held in refs, matching `useLiveQuery`) was applied to `useRiderOfferAlerts.ts`, which is this task's own file.

## Merge evidence

If these commits are squashed, preserve: RED at `9318886` (6 suites failing for the intended reasons), GREEN at `9ea91ae` (49 passing), live trigger verification at `09435ae`, and the final `2be9078` (220 tests, tsc clean, coverage 64.01% → 72.62%).
