# MapKit JS migration

Replaces Mapbox with Apple MapKit JS for the web app's map, address
autocomplete, and reverse geocoding.

## Why

The Mapbox account hit its usage limit. While over quota the token was refused
inconsistently — identical requests returned 200 and 401 minutes apart — which
surfaced in the UI as "could not load suggestions" and a blank grey map.

MapKit JS free tier is 250,000 map views and 25,000 service calls **per day**,
against Mapbox's 50,000 map loads per month, so the ceiling that was being hit
is roughly two orders of magnitude further away.

## Scope

Web app only. The Expo app in `mobile/` followed later and now uses the same
Apple account — see [mobile-mapkit.tdd.md](./mobile-mapkit.tdd.md).

## Authentication

Mapbox used a public token inlined into the browser bundle. MapKit JS needs a
Maps token, and `src/lib/mapkit/loadMapkit.ts` supports both ways of getting
one. It prefers a static token and falls back to the signing endpoint.

**Option A — dashboard token.** Apple's developer dashboard (Services → Maps →
Configure → Tokens) issues a ready-made MapKit JS token with a domain
restriction. Put it in `VITE_MAPKIT_TOKEN`. No private key, no server. It is
long-lived and ships in the bundle, so the domain restriction is the only thing
protecting it.

**Option B — signed tokens.** Leave `VITE_MAPKIT_TOKEN` empty and the browser
calls `/api/mapkit-token`, which signs a 30-minute ES256 JWT per visitor.

| Piece | Where |
|---|---|
| `.p8` private key, team/key IDs | Vercel project environment (`MAPKIT_*`) |
| ES256 signing | `api/_lib/mapkitJwt.ts` |
| Token endpoint | `api/mapkit-token.ts`, edge runtime, 30-minute tokens |
| Browser bootstrap | `src/lib/mapkit/loadMapkit.ts` |

A signed token must carry both `scope: "mapkit_js"` and an `origin` claim;
Apple refuses it otherwise, and the only symptom is a map that never appears.
`MAPKIT_ORIGIN` is therefore required, not optional.

`/api/mapkit-token` is unauthenticated, because the map is shown to signed-out
customers. The `origin` claim is what protects it: a token lifted from the
response is refused by Apple on any other domain.

Run `npm run check:mapkit` to verify credentials before deploying. It signs
with the same production code and asks Apple to validate the signature. Because
no public endpoint validates a `mapkit_js` token, the live check exchanges a
`server_api`-scoped one instead — which proves the team ID, key ID and `.p8`
belong together, but needs Maps Server API enabled on the same key.

## What changed in the client

| Before (Mapbox) | After (MapKit) |
|---|---|
| `react-map-gl` + `mapbox-gl` (~800 kB bundled) | `@apple/mapkit-loader`, SDK from Apple's CDN |
| Search Box `suggest` then `retrieve` | `Search.autocomplete()` — one call |
| Session tokens for billing | none; MapKit has no session concept |
| `bbox` + `country` params | `region` + `limitToCountries` |
| `maxBounds` | `cameraBoundary` |
| zoom levels | `cameraDistance` in metres |
| `createCirclePolygon` GeoJSON | `CircleOverlay` |
| React `<Marker>` children | `Annotation` with a DOM factory |

Autocomplete returning coordinates directly removed the two-step select: the
pin drops the moment a row is picked, with no second network round trip.

## Test coverage

| File | Covers |
|---|---|
| `api/_lib/mapkitJwt.test.ts` | JWT header/claims, PEM handling incl. escaped newlines, signature verified against the matching public key |
| `src/lib/mapkit/loadMapkit.test.ts` | single initialisation, token callback, ready/error events, retry after failure |
| `src/lib/mapkit/useMapkitMap.test.tsx` | construction, camera options, click→coordinate, teardown, failure state |
| `src/lib/geocoding.test.ts` | autocomplete filtering and labelling, Philippines bounds, abort handling, reverse geocode fallbacks |
| `src/components/AddressAutocompleteInput.test.tsx` | one-step selection, error messaging, request cancellation, stopping after an auth refusal |
| `src/components/map/mapPins.test.ts` | pin elements are distinct and detached |

## Failure behaviour

Address entry never hard-fails. If MapKit cannot authorise, the field stays
editable, the message names a configuration problem rather than blaming the
customer's typing, and the search stops retrying — a refused token fails
identically for every keystroke. The map shows an explicit "could not load"
panel instead of an unexplained grey box.
