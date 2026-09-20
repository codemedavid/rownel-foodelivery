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
