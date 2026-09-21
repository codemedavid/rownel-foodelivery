# Pre-submission findings

Found while preparing the iOS submission, by running the real iOS build on an
iPhone 17 Pro Max simulator. Neither is caused by the release work — both are
pre-existing.

---

## 1. BLOCKER — storefront is empty for anyone outside Vigan

**What happens.** `decorateAndFilterMerchantsByDistance`
(`mobile/src/lib/merchantDistance.ts`) drops every merchant whose
`max_delivery_distance_km` is less than the user's distance from it. Live data:

| Active merchants | With a distance cap | Uncapped |
|---|---|---|
| 78 | **78** | **0** |

Caps in use: 15, 20, 25, 29, 30, 35, 40, 50 km. Apple Park is ~11,000 km from
Vigan, so every merchant is filtered and the reviewer sees:

    Near you - 0 places available
    "Nothing nearby yet. No restaurants deliver to your location yet."

Reproduced end to end — see `evidence/reviewer-sees-empty-app.png`.

**Why it blocks.** An empty storefront reads as a broken app. This is the
standard shape of a Guideline 2.1 (App Completeness) rejection.

**Why the reviewer cannot work around it.** `MapLocationPicker` is mounted
only in `app/checkout.tsx`. Checkout needs a cart, a cart needs a merchant,
and no merchant is listed — so there is no path to changing the pin. The one
escape is declining the location prompt: `userLocation` stays null, the filter
is skipped, and all 78 merchants list.

**Options, cheapest first.**

1. *Review notes only* (already drafted in `listing.md`) — tell Apple to pick
   "Don't Allow". Zero code. Relies on the reviewer reading and following the
   note, and still leaves every real traveller with a dead app.
2. *Empty-state fallback* — when the distance filter yields nothing, show all
   merchants behind a banner such as "You're outside our delivery area -
   browsing all of Vigan." Small change in `app/(tabs)/index.tsx`, fixes the
   reviewer and the traveller at once. **Recommended.**
3. *Service-area pin* — if the user is outside a Vigan bounding box, default
   the pin to Vigan centre and say so. Best long-term, largest change.

Worth noting for (2): even standing in Vigan the list is only **5 merchants**,
because most are 20+ km out. Whatever fallback is chosen should probably also
soften the radius, or the storefront looks thin in its own home city.

---

## 2. Route-group collision — `/profile` opens the rider UI

**What happens.** Expo Router route groups add no path segment, so these pairs
resolve to the same URL and the router picks one:

| URL | Candidates |
|---|---|
| `/profile` | `app/(tabs)/profile.tsx`, `app/(rider)/profile.tsx` |
| `/orders` | `app/(tabs)/orders.tsx`, `app/(admin)/orders.tsx` |
| `/order/[id]` | `app/order/[id].tsx`, `app/(admin)/order/[id].tsx` |

`xcrun simctl openurl booted rownelfood:///profile` lands on the **rider**
interface — tab bar reads Dashboard / Deliveries / Earnings / Profile, body
reads "No rider profile". See
`evidence/deeplink-profile-lands-in-rider-ui.png`.

**Compounding it:** `app/(rider)/_layout.tsx` and `app/(admin)/_layout.tsx`
contain no role check — no `isRiderUser`, no `isAdminUser`, no `Redirect`.
`app/_layout.tsx` has no role gating either. Nothing turns a customer away
from an operational screen once they land on one; the screens presumably come
up empty only because RLS denies the queries.

**Scope.** In-app tab navigation is unaffected — it resolves inside its own
group. Push notifications are unaffected: `pushRouting.ts` writes explicit
prefixes (`/(admin)/order/…`, `/(rider)/delivery/…`). The collision bites only
URL-driven entry, i.e. the `rownelfood://` scheme and any web link into the app.

**Review impact: low.** Reviewers rarely exercise custom URL schemes. Filing
it as a correctness and access-control bug, not a submission blocker.

**Existing guard misses it.** `src/lib/routeStructure.test.ts` was written for
exactly this class of bug — its header cites "(rider)/index.tsx once shadowed
the storefront" — but it only inspects `index.*` files (`ownsRootRoute`). The
three collisions above are invisible to it. Widening that test to compare full
route paths across groups would have caught this.

**Suggested fix.** Give the rider and admin layouts a role guard that redirects
non-members to `/`, and widen `routeStructure.test.ts` beyond index files.
