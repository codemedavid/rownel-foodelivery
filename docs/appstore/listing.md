# App Store Connect listing — Row-Nel

Draft copy for the iOS submission. Everything here is editable in App Store
Connect before you hit Submit for Review.

## App information

| Field | Value |
|---|---|
| App Store Connect app id | `6814378905` |
| Bundle ID | `com.rownel.foodelivery` (portal id `Z85A44HZ77`) |
| SKU | `rownel-ios-001` |
| Primary language | English (U.S.) |
| Primary category | Food & Drink |
| Secondary category | Shopping |
| Age rating | 4+ |
| Price | Free |
| Privacy Policy URL | https://www.row-nel.com/privacy |
| Support URL | https://www.row-nel.com |

**Name (30 char max)**

    Rownel Food Delivery           (20 chars)

Confirmed by the owner — matches `app.json`, no change needed.

**Subtitle (30 char max)**

    Delivery, pabili at pasabay     (27 chars)

## Promotional text (170 char max)

    Order food, groceries and pabili from your favorite local stores — and
    watch your rider come to you in real time.

## Description (4000 char max)

    Row-Nel brings your neighborhood to your door.

    Order from local restaurants and stores, send someone on an errand, or
    have something picked up and dropped off — all from one app, with live
    tracking from the moment you order until your rider knocks.

    WHAT YOU CAN BOOK
    • Food — order from restaurants and eateries near you
    • Grocery — fresh goods and sari-sari staples
    • Pabili — tell us what to buy and we'll buy it for you
    • Pasabay — send an item along an existing route
    • Pick-up — collect something and bring it to you
    • Errands — queue, pay bills, drop off documents
    • Surprise — send a gift without leaving home

    BUILT AROUND YOUR LOCATION
    Set your delivery pin once and the app only shows you stores that
    actually deliver to you. Search works across dishes, stores and
    cuisines, so you can look for "sisig" instead of guessing which store
    has it.

    KNOW WHERE YOUR ORDER IS
    Follow every order from confirmed to preparing to on the way. When a
    rider picks up your order you get their details and a live map — plus a
    push notification at each step, so you don't have to keep the app open.

    REORDER IN SECONDS
    Your order history keeps every past basket. Tap one to rebuild the
    whole cart and check out again.

    Row-Nel is operated locally. Questions, special requests or something
    that doesn't fit a category — message the team and we'll sort it out.

## Keywords (100 char max, comma-separated, no spaces)

    delivery,food,pabili,pasabay,errand,grocery,vigan,ilocos,rider,padala,takeout,local

## What's New in This Version (first release)

    First release of the Row-Nel app. Order food, groceries, pabili and
    errands from local stores, and track your rider live from checkout to
    your door.

## App Review Information

### Demo account (created and sign-in verified)

    Email     appstore.review@row-nel.com
    Password  RownelReview2026!

Customer role (no `app_metadata.role`), email pre-confirmed, verified signing
in through the same anon-key path the app uses. Leave this account active for
as long as the app is on the store — Apple re-tests on every update.

### CRITICAL — the reviewer will see an empty app unless told otherwise

All 78 active merchants set `max_delivery_distance_km` (15-50 km) and the
storefront hard-filters on it. Verified on an iPhone 17 Pro Max simulator
located at Apple Park: the home screen renders

    Near you - 0 places available
    "Nothing nearby yet. No restaurants deliver to your location yet."

Screenshot: `docs/appstore/evidence/reviewer-sees-empty-app.png`. An empty
storefront reads as a broken app and is a standard Guideline 2.1 rejection.

There is no way for the reviewer to fix this from the UI — `MapLocationPicker`
only exists on the checkout screen, which is unreachable until a cart has
items. The only escape is to **decline the location prompt**: with no location
the distance filter is skipped and all 78 merchants list.

So the notes below must be explicit. Fill in the contact fields before submitting.

    Row-Nel is a local delivery service. It operates only in Vigan City,
    Ilocos Sur, Philippines.

    IMPORTANT: when the app asks for location access on first launch,
    please choose "Don't Allow". The storefront only lists merchants that
    deliver to your current position, so allowing location from outside
    Vigan City will correctly - but unhelpfully - show an empty list.
    Declining the prompt lists every merchant so you can review the app.

    If you prefer to test with location enabled, please set a simulated
    location of 17.5747, 120.3869 (Vigan City).

    Sign in with the demo account above to browse merchants, build a cart
    and reach checkout, where the delivery pin can be dragged.

    The build also contains rider and administrative dashboards used only
    by Row-Nel staff and contracted riders. They are unlocked by a
    server-side role on the account and are not part of the customer
    experience.

Status: **filled in App Store Connect via the API.**
Contact: Arnel Calado, +639485390519, abenesanna@gmail.com (E.164 required).
Rider/admin logins were not handed over; the notes declare them internal-only.

## App Privacy (data collection questionnaire)

Based on what the app actually sends to Supabase:

| Data type | Collected | Linked to user | Used for tracking | Purpose |
|---|---|---|---|---|
| Name | Yes | Yes | No | App Functionality |
| Email address | Yes | Yes | No | App Functionality |
| Phone number | Yes | Yes | No | App Functionality |
| Precise location | Yes | Yes | No | App Functionality |
| Coarse location | Yes | Yes | No | App Functionality |
| Purchase history | Yes | Yes | No | App Functionality |
| Device ID (push token) | Yes | Yes | No | App Functionality |

No third-party advertising or analytics SDKs are bundled, so **Tracking = No**
across the board and no App Tracking Transparency prompt is required.

## Screenshots

Requirement: 6.9" iPhone at 1320 x 2868. Apple scales this set down for
smaller iPhones, and iPad is not needed (`supportsTablet: false`).

**Five uploaded**, in narrative order, all verified at exactly 1320 x 2868:

| # | File | Screen |
|---|---|---|
| 1 | `01-home.png` | Storefront, "Near you" with live distances |
| 2 | `02-menu.png` | Merchant menu with categories and prices |
| 3 | `03-item.png` | Item detail with quantity stepper |
| 4 | `04-cart.png` | Basket with subtotal, delivery fee, total |
| 5 | `05-checkout.png` | Checkout with the Apple Maps pin on Vigan |

Captured by driving the real iOS build on an iPhone 17 Pro Max simulator with
`idb` (`idb_companion` was already installed; the client went into a throwaway
venv). Synthetic taps via AppleScript are not possible here -- the terminal
lacks Accessibility permission -- but idb talks to the simulator directly and
needs none.

Live order tracking was deliberately **not** captured: it requires placing a
real order against production, which would notify actual merchants and riders.
To add it, place a test order in a safe window and run
`xcrun simctl io booted screenshot 06-tracking.png`.

## Remaining before Submit for Review

1. **App Privacy questionnaire** -- the only item with no API. Every endpoint
   probed (`/v1/appPrivacyDetails`, `/v1/appDataUsages`, and variants) returns
   404. Fill it in the web UI using the table above.
2. Consider the empty-storefront fallback in `docs/appstore/review-risks.md`.
3. Confirm the `userGeneratedContent` age-rating answer (see review-risks.md).
