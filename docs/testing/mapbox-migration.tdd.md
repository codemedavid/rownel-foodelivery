# TDD Evidence — Leaflet + OpenStreetMap → Mapbox

**Date:** 2026-09-20
**Branch:** `feat/catalog-image-sourcing`
**Source plan:** produced inline via `/ecc:plan` in this session (no `*.plan.md` artifact written); journeys below are derived from that plan.

## Scope

Replaced both map providers:

- **Rendering:** `leaflet` + `react-leaflet` + OSM raster tiles → `mapbox-gl` + `react-map-gl`
- **Geocoding:** Nominatim → Mapbox Geocoding API v6 (web **and** Expo mobile)
- `leaflet`, `react-leaflet`, `@types/leaflet` uninstalled; the unpkg Leaflet CSS/marker CDN references removed.

The Mapbox v6 request and response shapes were verified against the **live API** before implementation, not from memory
(`GET /search/geocode/v6/forward` and `/reverse`), which is how `context.address.street_name` and the uppercase
`context.country.country_code` were confirmed.

## User Journeys

1. As a customer, I want to search my delivery address and pick it from suggestions, so checkout has an exact location.
2. As a customer, I want to drop or drag a pin on the map, so I can correct an address the search got wrong.
3. As a customer, I want "Use My Current Location" to resolve to a street with a house number, so the rider can find me.
4. As an admin, I want to set a merchant's location and see its delivery radius drawn on the map.
5. As a customer, I want to watch the rider's live position move on the order map.
6. As a mobile user, I want the app to show the same street-level address the website shows for the same GPS fix.

## Task Report

### Task 1 — Web geocoding module (`src/lib/geocoding.ts`)

Replaced `src/lib/osm.ts` with a Mapbox v6 client keeping identical function signatures
(`searchAddresses`, `reverseGeocode`, `isWithinPhilippines`), so consumers needed only an import and type rename
(`OSMAddressSuggestion` → `AddressSuggestion`).

- **RED** — `npx vitest run src/lib/geocoding.test.ts`

  ```
  Error: Failed to resolve import "./geocoding" from "src/lib/geocoding.test.ts". Does the file exist?
  Test Files  1 failed (1)
       Tests  no tests
  ```

  Compile-time RED: the new suite references the not-yet-written module.

- **First GREEN attempt failed — a real defect the test caught:**

  ```
  Tests  1 failed | 13 passed (14)
  ✕ drops features that carry no usable coordinates
  ```

  `Number(null)` is `0`, not `NaN`, so a feature with `coordinates: {latitude: null, longitude: null}` passed the
  `Number.isFinite` guard and would have rendered as a valid pin in the Gulf of Guinea. Fixed by type-guarding before
  coercion.

- **GREEN** — `npx vitest run src/lib/geocoding.test.ts`

  ```
  Test Files  1 passed (1)
       Tests  14 passed (14)
  ```

**Guaranteed:** forward/reverse field mapping; `street` composed as house number + street name with a feature-name
fallback; PH `country`/`bbox` constraint applied only for `ph`; null/non-finite coordinates rejected; non-OK responses
raise a named error; a blank query performs no network call; a no-match reverse falls back to the caller's coordinates
rather than throwing.

### Task 2 — Delivery-radius polygon (`src/lib/geoCircle.ts`)

Mapbox GL has no circle-in-metres primitive, so Leaflet's `<Circle radius>` became a 64-point GeoJSON polygon fed to a
`<Source>` + fill/line `<Layer>`.

- **RED** — `Error: Failed to resolve import "./geoCircle" … Tests: no tests`
- **GREEN** — `npx vitest run src/lib/geoCircle.test.ts` → `Tests  7 passed (7)`

**Guaranteed:** the ring is closed; coordinates are emitted `[longitude, latitude]`; every ring point sits the requested
radius from the centre (verified independently with Haversine); the shape scales with radius; a zero radius degenerates
to the centre; successive calls share no array references.

### Task 3 — Web map components

`MapLocationPicker.tsx` and `RiderTrackingMap.tsx` ported from `react-leaflet` to `react-map-gl`. The three
`L.divIcon` HTML strings became real JSX children of `<Marker>`, removing hand-built `innerHTML`.

Because `mapbox-gl` renders through WebGL, which jsdom does not implement, `react-map-gl/mapbox` is mocked in
`src/test/setup.ts`. Leaflet survived jsdom; without this mock the pre-existing `RiderDashboard` and
`CustomerRiderPanel` suites — which render `RiderTrackingMap` for real — would crash.

- **GREEN** — `npx vitest run` → `Test Files  23 passed (23) · Tests  268 passed (268)`

### Task 4 — Mobile geocoding (`mobile/src/lib/geocoding.ts`)

The Expo app renders no map; it used Nominatim only for geocoding. Ported to Mapbox v6, keeping the existing
`AbortController` timeout and dropping the Nominatim-policy `User-Agent` header.

- **RED** — `npx jest src/lib/geocoding.test.ts`

  ```
  ● Test suite failed to run
    Cannot find module './geocoding' from 'src/lib/geocoding.test.ts'
  Tests: 0 total
  ```

- **GREEN** — `Test Suites: 1 passed · Tests: 17 passed, 17 total`

- **Fixture updates required by the provider change** (test-side, not production bugs) —
  `mobile/src/context/LocationContext.test.tsx` stubbed Nominatim-shaped JSON and set no Mapbox token, so the provider
  correctly fell back to Expo's on-device geocoder:

  ```
  ● LocationProvider (mobile) › prefers the … address, including the house number
    Expected: 1 Rizal Street
    Received: San Roque
  ```

  The stub was reshaped to a Mapbox `FeatureCollection` and the token stubbed in `beforeEach`.

- **GREEN (full mobile suite)** — `Test Suites: 36 passed, 36 total · Tests: 325 passed, 325 total`

## Test Specification

| # | What is guaranteed | Test file | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | A blank address query returns `[]` and performs no network request | `src/lib/geocoding.test.ts` | unit | PASS | `npx vitest run src/lib/geocoding.test.ts` |
| 2 | A Mapbox address feature maps to `{placeId, displayName, latitude, longitude, countryCode}` | `src/lib/geocoding.test.ts` | unit | PASS | same |
| 3 | Forward search hits `/search/geocode/v6/forward` with `q`, `limit` and a token | `src/lib/geocoding.test.ts` | unit | PASS | same |
| 4 | `countryCodes: ['ph']` applies both `country=ph` and the PH bbox; other countries get no bbox | `src/lib/geocoding.test.ts` | unit | PASS | same |
| 5 | Features with null/non-finite coordinates are dropped, not rendered at 0,0 | `src/lib/geocoding.test.ts` | unit | PASS | same |
| 6 | A non-OK Mapbox response raises a named error for both search and reverse | `src/lib/geocoding.test.ts` | unit | PASS | same |
| 7 | Reverse geocode builds `street` as house number + street name | `src/lib/geocoding.test.ts` | unit | PASS | same |
| 8 | Reverse geocode falls back to the feature name when no street detail exists | `src/lib/geocoding.test.ts` | unit | PASS | same |
| 9 | Reverse geocode with no match returns the caller's coordinates and a usable label | `src/lib/geocoding.test.ts` | unit | PASS | same |
| 10 | The radius polygon is closed and emitted `[lng, lat]` | `src/lib/geoCircle.test.ts` | unit | PASS | `npx vitest run src/lib/geoCircle.test.ts` |
| 11 | Every radius ring point sits the requested km from the centre (Haversine-verified) | `src/lib/geoCircle.test.ts` | unit | PASS | same |
| 12 | Radius polygons share no mutable array references between calls | `src/lib/geoCircle.test.ts` | unit | PASS | same |
| 13 | Rider dashboard / customer rider panel still render with a WebGL-free map stub | `src/components/RiderDashboard.test.tsx`, `CustomerRiderPanel.test.tsx` | component | PASS | `npx vitest run` |
| 14 | Web location context resolves and persists a reverse-geocoded location | `src/contexts/LocationContext.test.tsx` | integration | PASS | `npx vitest run` |
| 15 | Mobile returns the same street-level address shape as web | `mobile/src/lib/geocoding.test.ts` | unit | PASS | `cd mobile && npx jest` |
| 16 | Mobile search is bounded to the Philippines (`country=ph` + bbox) | `mobile/src/lib/geocoding.test.ts` | unit | PASS | same |
| 17 | Mobile throws a named error when `EXPO_PUBLIC_MAPBOX_TOKEN` is absent | `mobile/src/lib/geocoding.test.ts` | unit | PASS | same |
| 18 | Mobile prefers Mapbox but falls back to the on-device geocoder when it is unreachable | `mobile/src/context/LocationContext.test.tsx` | integration | PASS | same |

## Coverage

| Module | Stmts | Branch | Funcs | Lines | Command |
|---|---|---|---|---|---|
| `src/lib/geocoding.ts` | 97.14% | 81.03% | 100% | 97.01% | `npx vitest run --coverage` |
| `src/lib/geoCircle.ts` | 100% | 100% (0/0) | 100% | 100% | `npx vitest run --coverage --coverage.include='**/geoCircle.ts' src/lib/geoCircle.test.ts` |
| `mobile/src/lib/geocoding.ts` | 97.05% | 84% | 93.33% | 100% | `cd mobile && npx jest --coverage --collectCoverageFrom='src/lib/geocoding.ts'` |

All three clear the 80% threshold. The web geocoding module previously had **no tests at all**, so this is net-new
coverage on the checkout address path.

### Build

`npm run build` → succeeds. `mapbox-gl` is emitted as its own chunk: **1,883 kB raw / 530 kB gzip**.

That chunk is **not** on the initial load path. `react-map-gl` v8 resolves the library from inside `_Map`'s mount
effect — `Promise.resolve(mapLib || import("mapbox-gl"))` in
`node_modules/@vis.gl/react-mapbox/dist/index.cjs` — so it is fetched the first time a `<Map>` mounts (checkout,
merchant admin, rider views) and never on pages without a map. Verified against the build output: the entry chunk
references `mapbox-gl-*.js` only through `import(...)`, with zero static imports.

Consequence: wrapping the map components in `React.lazy` was considered and **rejected as redundant** — it would add
Suspense boundaries for no measurable gain. The only eager Mapbox cost is the stylesheet imported by `src/main.tsx`,
**48.9 kB raw / 5.8 kB gzip**, which is not worth restructuring to defer.

## Known Gaps and Pre-existing Issues

- **No E2E tests.** The repo has no Playwright setup; map drag/click and live rider panning are covered only at the
  component-stub level. Manual smoke testing of the five map surfaces is still required before deploy.
- **`geoCircle.ts` does not appear in the default coverage table** despite being listed in `vitest.config.ts`. The
  pre-existing `src/lib/imageCatalog.ts` entry has the identical symptom, so this is a repo coverage-config quirk, not a
  regression from this work. Coverage was measured with an explicit `--coverage.include` override instead.
- **`npm run lint` is broken repo-wide, pre-existing.** ESLint 9.36 crashes while *loading* the
  `@typescript-eslint/no-unused-expressions` rule (`Cannot read properties of undefined (reading 'allowShortCircuit')`),
  an eslint/typescript-eslint version incompatibility. Verified pre-existing: it fails identically on the untouched
  `src/App.tsx`. Not fixed here — out of scope.
- **`tsc --noEmit` reports 84 pre-existing errors** across `AdminDashboard`, `MenuItemCard`, `MerchantManager`,
  `OrdersManager`, `OrderTracking` and others. Zero remain in any file authored or modified by this work; two
  introduced during the port (`MapLayerMouseEvent` → `MapMouseEvent`, and `Array.prototype.at` against this tsconfig's
  lib target) were fixed.
- **Mapbox terms — permanent storage.** The live API response carries
  `"This response and the information it contains may not be retained."` This app persists `latitude`, `longitude`,
  `formatted_address` and a place id to Supabase. Standard geocoding permits temporary caching only; permanent storage
  requires the permanent-geocoding entitlement. Coordinates a user sets by dragging the pin are user-generated and not
  subject to this. **Open decision for the account owner.**
- **`merchants.osm_place_id`** still carries its OSM-era name and now stores Mapbox ids. Deliberately deferred
  (plan Phase 6): the value is only ever written and read as a truthy "address confirmed" flag
  (`Checkout.tsx`), never queried back against a provider, so stale ids are harmless.
- **Token restriction.** `VITE_MAPBOX_TOKEN` is public by design and inlined into the browser bundle. It must be
  URL-restricted in the Mapbox dashboard (Vercel domain + localhost) before deploy.

## Merge Evidence

No checkpoint commits were created: the working tree carried a large set of unrelated in-progress changes
(~30 modified `mobile/` files) that a stage-all commit would have swept in. The RED/GREEN evidence above is the
preserved proof; copy this section into the PR body if these changes are squashed.

| Stage | Evidence |
|---|---|
| RED (web geocoding) | `Failed to resolve import "./geocoding"` — 0 tests run |
| RED (geoCircle) | `Failed to resolve import "./geoCircle"` — 0 tests run |
| RED (mobile geocoding) | `Cannot find module './geocoding'` — 0 tests run |
| Defect caught by RED→GREEN | `Number(null) === 0` admitted null coordinates as a valid pin |
| GREEN (web) | `Test Files 23 passed · Tests 268 passed` |
| GREEN (mobile) | `Test Suites 36 passed · Tests 325 passed` |
| Build | `npm run build` succeeds |

---

# Follow-up: Philippines-only search scope and result relevance

**Reported:** autocomplete returned mostly international places, too few options, and matches "too far" away.

## Root Causes (reproduced against the live Mapbox API)

| # | Cause | Evidence |
|---|---|---|
| 1 | `MerchantsList.tsx` (customer "My location" picker) never passed `countryCodes`, so the request carried no `country` filter | `q=San Roque` with no `country` returned Paraguay, Spain, Colombia before any PH result |
| 2 | No `proximity` bias — Mapbox ranked same-named streets nationwide equally | `q=Rizal Street` (country=ph, no proximity) returned Bislig, Mati, Tandag — all Mindanao, ~1,000 km from the service area |
| 3 | `AddressAutocompleteInput` hard-coded `limit: 5`; Mapbox allows 10 | only 5 rows ever rendered |
| 4 | `countryCodes={['ph']}` was passed as an inline array literal into a `useEffect` dependency, restarting the 350 ms debounce on every parent render | `useEffect(..., [countryCodes, value])` with a new array identity each render |

## Changes

- **`searchAddresses` now enforces the Philippines itself** — `country=ph` + `bbox` are always sent; the
  `countryCodes` option is gone. A call site can no longer forget the filter, which is what caused cause 1.
- **Proximity bias added** — callers pass the pin / GPS fix; absent that, `proximity=ip` lets Mapbox infer the
  searcher's region. Converted to `lng,lat` at the Mapbox boundary only.
- **Default limit raised 5 → 10** (the Mapbox forward-geocoding maximum).
- **Defensive post-filter** — any suggestion outside the PH box is dropped even if the API returns one.
- **`PHILIPPINES_BOUNDS` exported and applied as `maxBounds`** on the map, so panning stops at the coastline and
  a pin cannot be dropped abroad.
- Debounce dependency now uses lat/lng primitives instead of the object identity.

## RED → GREEN

| Stage | Command | Result |
|---|---|---|
| RED (web) | `npx vitest run src/lib/geocoding.test.ts` | `Tests 7 failed | 12 passed (19)` |
| RED (mobile) | `npx jest src/lib/geocoding.test.ts` | `Tests: 3 failed, 17 passed, 20 total` |
| GREEN (web) | `npx vitest run src/lib/geocoding.test.ts` | `Tests 19 passed (19)` |
| GREEN (mobile) | `npx jest src/lib/geocoding.test.ts` | `Tests: 20 passed, 20 total` |
| Full web suite | `npx vitest run` | `Test Files 35 passed · Tests 603 passed` |
| Full mobile suite | `cd mobile && npx jest` | `Test Suites 36 passed · Tests 328 passed` |
| Typecheck | `npx tsc --noEmit` | 0 errors |
| Build | `npm run build` | `✓ built in 4.63s` |

## Test Specification (added)

| # | What is guaranteed | Test | Type |
|---|---|---|---|
| 1 | Every search is clamped to `country=ph` + PH bbox even when called with no options | `src/lib/geocoding.test.ts:constrains every search to the Philippines without being asked` | unit |
| 2 | Ten suggestions are requested by default | `src/lib/geocoding.test.ts:requests ten suggestions by default` | unit |
| 3 | A supplied proximity point is sent as `lng,lat`, not `lat,lng` | `src/lib/geocoding.test.ts:biases results toward the supplied proximity point in lng,lat order` | unit |
| 4 | Proximity falls back to `ip` when no reference point is known | `src/lib/geocoding.test.ts:falls back to IP-based proximity when no reference point is known` | unit |
| 5 | A foreign suggestion is dropped even if the API returns one | `src/lib/geocoding.test.ts:drops suggestions that fall outside the Philippines` | unit |
| 6 | `PHILIPPINES_BOUNDS` is `[southwest, northeast]` in Mapbox `[lng, lat]` order | `src/lib/geocoding.test.ts:is a [southwest, northeast] pair in Mapbox [lng, lat] order` | unit |
| 7 | The bounds contain Manila and exclude Hong Kong | `src/lib/geocoding.test.ts:contains Manila and excludes Hong Kong` | unit |
| 8–10 | Same proximity / PH-filter guarantees on mobile | `mobile/src/lib/geocoding.test.ts` | unit |

`src/lib/geocoding.ts` coverage: **96.38% stmts, 79.31% branch, 100% funcs, 97.46% lines**.

## Live Verification

`q=San Roque`, `q=Rizal Street`, `q=Poblacion` with the exact parameter set the app now sends
(`country=ph`, `bbox`, `proximity=ip`, `limit=10`) returned 100% Philippine results, all within the
searcher's own region (La Union / Pangasinan / Ilocos / Benguet). No foreign results in any query.

## Known Gaps

- `maxBounds` on `<Map>` is a declarative prop and is not unit-tested — the test setup mocks
  `react-map-gl/mapbox` as a passthrough, so props are not observable. The coordinate-order risk it carries is
  covered instead by the two `PHILIPPINES_BOUNDS` tests above. Still worth a manual smoke test.
- `proximity=ip` depends on Mapbox's IP geolocation. On a VPN or a mis-located IP the bias will be wrong, but
  `country=ph` still bounds the result set, so the failure mode is "less relevant", never "foreign".

---

# Follow-up 2: Search Box API for business and landmark names

**Reported:** production still showed Germany / Virginia / Italy for the query "Buko Spot".

## Two distinct findings

**1. The screenshot predated the deploy.** The fix from Follow-up 1 shipped at `2026-09-20 03:40:54 UTC`
(`last-modified` on `https://www.row-nel.com/assets/index-BKtDuWzr.js`, hash identical to the local build).
The deployed bundle contains `country:"ph"`, `bbox`, `proximity`, `limit 10`, the PH post-filter and
`maxBounds`. The reported result set was reproduced exactly — same five rows, same order — by calling Mapbox
with the *old* parameters, confirming a stale client bundle rather than a code defect.

**2. A real, separate defect.** The Geocoding API indexes addresses, streets and places only — **never
businesses**. "Buko Spot" is a store, so it could not match at any country or proximity setting. With the
Follow-up 1 parameters it returned `Spotfish Street Mactan`, `Bauko`, `Buko Road` — Philippine but wrong.

## Change

Address autocomplete moved from Geocoding `forward` to the **Search Box API**, which indexes POIs:

- `suggestAddresses(query, { sessionToken, proximity, limit })` → `/search/searchbox/v1/suggest`
- `retrieveAddress(placeId, { sessionToken })` → `/search/searchbox/v1/retrieve/{id}`

Search Box withholds coordinates from `suggest` by design, so selection is now two-step: the dropdown renders
candidates, and the pin is resolved on click. `onSelect` still hands consumers a fully-populated
`AddressSuggestion`, so `Checkout`, `MerchantManager`, `MerchantsList` and `MapLocationPicker` were untouched.

Session tokens: Mapbox bills one Search Box session per token covering every keystroke plus the single
retrieve that closes it. `createSearchSessionToken()` mints one per search and it is rotated after each
retrieve. `crypto.randomUUID` with a fallback for Safari < 15.4.

`reverseGeocode` (dropped pins, GPS) stays on Geocoding v6 — it needs no session and is purpose-built for
coordinate → address.

A POI's `full_address` omits the business name (`Buko Spot` → `"Phase 4, Lucena, 4301"`), so `composeLabel`
leads with the name unless the full address already does. Dropdown rows now show the name above the
town/province line.

## RED → GREEN

| Stage | Command | Result |
|---|---|---|
| RED | `npx vitest run src/lib/geocoding.test.ts` | `Tests 13 failed | 9 passed (22)` |
| GREEN | `npx vitest run src/lib/geocoding.test.ts` | `Tests 22 passed (22)` |
| Full web suite | `npx vitest run` | `Test Files 35 passed · Tests 606 passed` |
| Typecheck | `npx tsc --noEmit` | 0 errors |
| Build | `npm run build` | `✓ built in 4.54s` |

`src/lib/geocoding.ts` coverage: 88.98% stmts, 67.7% branch, 94.11% funcs, 90.9% lines.

## Test Specification (added)

| # | What is guaranteed | Test | Type |
|---|---|---|---|
| 1 | A session token is distinct per search session | `createSearchSessionToken:issues a distinct token per search session` | unit |
| 2 | Suggest hits the Search Box endpoint bounded to PH, with the session token | `suggestAddresses:asks the Search Box suggest endpoint, bounded to the Philippines` | unit |
| 3 | Proximity is sent as `lng,lat`, falling back to `ip` | `suggestAddresses:biases…` / `…falls back to IP-based proximity` | unit |
| 4 | A business result leads with its own name, not its street address | `suggestAddresses:leads a business result with its own name, not its street address` | unit |
| 5 | A street result keeps its full address when it already begins with the name | `suggestAddresses:keeps the full address when it already begins with the feature name` | unit |
| 6 | Suggestions with no id are dropped (they cannot be retrieved) | `suggestAddresses:drops suggestions that carry no id, since they cannot be retrieved` | unit |
| 7 | Retrieve resolves the coordinates suggest withheld, in the same session | `retrieveAddress:retrieves…` / `…resolves the coordinates the suggest step did not carry` | unit |
| 8 | Retrieve returns null for a place outside the Philippines | `retrieveAddress:returns null when the retrieved place sits outside the Philippines` | unit |
| 9 | Retrieve returns null for an unknown id | `retrieveAddress:returns null when Mapbox knows nothing about the id` | unit |
| 10 | Blank queries and API rejections behave | `suggestAddresses:returns an empty list…` / `…throws when Mapbox rejects the request` | unit |

## Live Verification

`q=Buko Spot` with the exact deployed parameter set returned the business as the top result
(`Buko Spot, Lucena, 4301, Philippines`), followed by `Buko Spot, Liloan`, `Buko Juice Spot, Davao City`.
Retrieve on the first row resolved to `13.95260879, 121.62571486`, inside the PH box.

## Known Gaps

- **Mobile is unchanged.** `mobile/src/lib/geocoding.ts:searchAddresses` still uses Geocoding `forward`, but it
  has no callers — the Expo app only reverse-geocodes. Migrating it now would be speculative; it must be
  migrated if a mobile address autocomplete is ever added, or the two clients will behave differently.
- **Billing model changed.** Search Box is billed per session, Geocoding per request. Expected to be cheaper
  for typeahead, but worth watching on the Mapbox usage dashboard after this ships.
- The two-step selection is not covered by a component-level test; `AddressAutocompleteInput` has no test file.
  The suggest/retrieve contract it depends on is fully unit-tested at the library level.
