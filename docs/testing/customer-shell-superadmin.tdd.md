# TDD Evidence — Customer Mobile Shell, Optional Accounts, Superadmin Mobile, Order Notifications

**Date:** 2026-08-27
**Source plan:** Inline plan produced by `/ecc:plan` in this session (no `.plan.md` artifact); user confirmed with "proceed".
**Branch:** `feat/catalog-image-sourcing`

## User journeys

1. As a customer, I want a bottom navigation (Home, Orders, Cart, Profile) so I can move around the app like a native mobile app.
2. As a customer, I want to optionally register or sign in so my order history follows me across devices — while guest checkout keeps working.
3. As a customer, I want a notification (sound + browser notification) when the merchant confirms my order (and on later status changes).
4. As a superadmin, I want the existing `/admin` dashboard to be usable from a phone.

## RED → GREEN cycle per feature

| Feature | RED commit (reproducer) | RED evidence | GREEN commit | GREEN evidence |
|---|---|---|---|---|
| `isCustomerUser` role helper | `0754c96` | `npx vitest run src/lib/authRoles.test.ts` → 5 failed / 3 passed (helper missing) | `473bdb5` | same command → 8 passed |
| `BottomNav` | `65c24ff`-preceding test commit (`test: add reproducer for customer bottom navigation`) | `npx vitest run src/components/BottomNav.test.tsx` → module not found (compile-time RED) | `65c24ff` | same command → 8 passed |
| `ProfilePage` | `test: add reproducer for optional customer profile auth` | compile-time RED (module missing) | `65c24ff` | 7 passed |
| `useCustomerOrderNotifications` | `test: add reproducer for customer order-status notifications` | compile-time RED (module missing) | `96a754a` | 5 passed |
| `AdminMobileNav` | `test: add reproducer for mobile admin section nav` | compile-time RED (module missing) | `9d5a5a5` | 3 passed |

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | Authed user without an operational role counts as customer; admin/staff/rider/legacy-admin-email do not; user_metadata is never trusted | `src/lib/authRoles.test.ts` | unit | PASS |
| 2 | Bottom nav renders Home/Orders/Cart/Profile, marks active tab via `aria-current`, shows cart badge only when count > 0 | `src/components/BottomNav.test.tsx` | unit | PASS |
| 3 | Bottom nav renders nothing on `/admin*`, `/staff*`, `/rider*` routes | `src/components/BottomNav.test.tsx` | unit | PASS |
| 4 | Profile offers optional sign-in/registration; submits credentials to `signIn`/`signUp`; surfaces auth errors; shows sign-out and role shortcuts (admin link only for admins) | `src/components/ProfilePage.test.tsx` | unit | PASS |
| 5 | Order watcher never notifies for statuses seen on first load; notifies exactly once on transition to `confirmed`; ignores unchanged statuses, empty history, and records older than 24 h | `src/hooks/useCustomerOrderNotifications.test.ts` | unit | PASS |
| 6 | Admin mobile chip bar lists core sections, reports taps via `onSelect(key)`, and marks active chip `aria-pressed` | `src/components/AdminMobileNav.test.tsx` | unit | PASS |

## Validation commands actually run

```
npm test                 → 21 files, 246 tests, all passed
npx tsc --noEmit         → clean
npm run build            → built in 2.63s (pre-existing >500 kB chunk warning)
npm run test:coverage    → new modules: ProfilePage 97.4% stmts, authRoles 100% lines,
                           useCustomerOrderNotifications 94.9% lines (85.7% stmts)
```

## Database migration (applied to live project)

`supabase/migrations/20260827000000_add_customer_accounts.sql` applied via Supabase MCP
(`apply_migration add_customer_accounts`, success). Post-apply `get_advisors security`
reports only WARN-level notices of the same pre-existing class (SECURITY DEFINER RPCs);
`list_my_orders()` raises `Unauthorized` for anonymous callers. Note: this migration also
carries the `create_order` delivery-mode COALESCE fix from
`20260711000000_fix_create_order_delivery_mode_default.sql`, which was in the repo but had
never been applied to the live database.

## Known gaps / intentional scope

- Notifications fire only while the site/app is open in a tab (poll every 30 s of the
  device's recent orders). True closed-app push (Web Push / FCM via a Supabase Edge
  Function) is a documented follow-up.
- `npm run lint` crashes repo-wide with a pre-existing eslint 9.36 / @typescript-eslint
  rule-loading incompatibility (`no-unused-expressions … allowShortCircuit`) on files
  untouched by this work; not addressed here.
- Global coverage is 62.6% (legacy codebase); the 80% bar is met for the new modules.
- The repo also contains an Expo app under `mobile/`; this work targeted the responsive
  web app per the approved plan. Porting the same features to the Expo app is a follow-up.
