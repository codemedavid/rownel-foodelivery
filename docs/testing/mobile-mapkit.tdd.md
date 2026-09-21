# Apple Maps in the Expo app

Brings the `mobile/` app onto the same Apple Maps account the website moved to
in [mapkit-migration.tdd.md](./mapkit-migration.tdd.md), and gives it maps for
the first time.

## Why

The web app moved to MapKit JS when the Mapbox account went over quota. The
Expo app was left behind on Mapbox, against the same dead account, so its
address prefill failed intermittently — and it had no map at all. Checkout was
a plain text box, and none of the three order screens could show where anything
was.

## The obstacle

MapKit JS is a browser SDK. There is no React Native build, and Apple ships no
native Android Maps SDK either, so `react-native-maps` would have meant Apple
maps on iOS and Google maps on Android — two different maps, a second API key,
and a dev build.

## Shape

Two different problems, solved two different ways, both through the existing
web deployment. The app holds no Apple credential of any kind.

### Maps — a WebView on this app's own origin

`mobile/src/components/map/MapEmbedView.tsx` loads `/map-embed.html` from the
web deployment. That page is a second Vite entry (`src/mapEmbed/main.ts`), so
it authorises through the very same `/api/mapkit-token` the website uses.

Serving it over the network rather than as a local HTML string is the whole
trick: a MapKit JS token carries an `origin` claim, and a WebView showing local
content has no origin Apple will accept.

It costs 5 kB gzipped and leaves the storefront bundle untouched, because
`build.rollupOptions.input` makes it a separate entry.

| Direction | Channel | Why |
|---|---|---|
| Opening view (centre, zoom, interactivity) | URL query string | Needed before the map exists, and Android reloads a WebView on memory pressure — it must come back the same way it went in |
| Pins, circles, recentres | `injectJavaScript` → `window.__rownelMapEmbed` | Pins move; a URL change would reload the page and lose the customer's panning |
| Taps, pin drags, ready, failure | `ReactNativeWebView.postMessage` | The only channel back |

`mobile/src/lib/map/mapEmbedProtocol.ts` and
`src/lib/mapkit/mapEmbedProtocol.ts` are deliberate twins — two deploy
artefacts that cannot import from each other, so the shapes are the wire
format. Both sides ignore anything they do not recognise, which is what lets an
app release ship ahead of a web deploy.

### Address lookups — a server-side proxy

`/api/maps-search` and `/api/maps-reverse` sign a `server_api` token with the
existing `.p8` and call Apple's Maps Server API.

The app could have called Apple directly with a token fetched from here. It
does not, because a `server_api` token takes **no** `origin` claim — unlike the
browser's `mapkit_js` token, there is nothing to pin it to. One handed to a
phone could spend this account's quota from anywhere, and a token baked into an
installed binary cannot be rotated without a release.

The access token is exchanged once per warm serverless instance and cached:
the exchange itself counts against the daily service-call quota.

## Configuration

One new variable, `EXPO_PUBLIC_WEB_ORIGIN` in `mobile/.env`. `EXPO_PUBLIC_MAPBOX_TOKEN`
is gone.

`OPTION B` in the root `.env.example` (the `.p8`) is **required** for address
search. With only a dashboard `VITE_MAPKIT_TOKEN` the map still draws — the
embed page accepts either — but `/api/maps-*` cannot sign anything, and the
app falls back to a plain typed address.

## What each screen got

| Screen | Map |
|---|---|
| `app/checkout.tsx` | Autocomplete field plus a draggable pin. The pin, not the GPS fix, is what the order is delivered to and what the delivery fee is quoted from |
| `app/order/[id].tsx` | The assigned rider, polled every 12s; before assignment, the other riders in the area |
| `app/(rider)/delivery/[id].tsx` | Pickup and drop-off. Turn-by-turn is still an explicit hand-off to the maps app |
| `app/(admin)/order/[id].tsx` | Rider, pickup and drop-off, so a stalled delivery is visible without ringing the rider |

## Field-name traps

The Server API and MapKit JS describe the same place differently, and the
mismatch is silent:

| MapKit JS | Maps Server API |
|---|---|
| `coordinate: {latitude, longitude}` | autocomplete: `location: {lat, lng}` |
| `formattedAddress` (string) | `formattedAddressLines` (array) |
| result `id` | none — `completionUrl` is the nearest handle |

`api/_lib/appleMapsPlaces.ts` absorbs all of it, so both clients receive
identical objects.

## Test coverage

| File | Covers |
|---|---|
| `api/_lib/appleMapsPlaces.test.ts` | Apple's `lat`/`lng` field names, display-line splitting, PH bounds, null-vs-zero coordinates, street composition |
| `api/mapsHandlers.test.ts` | the access token never reaching the phone, PH clamping the client cannot widen, validation before any service call is spent, Apple outage → 502 vs quota → 429, token cached once and not cached after a failure |
| `src/lib/mapkit/mapEmbedProtocol.test.ts` | URL round-trip, malformed query opening a usable map, unknown commands ignored |
| `src/components/map/mapPins.test.ts` | pins carry their own colour, so they survive outside the Tailwind build |
| `mobile/src/lib/map/mapEmbedProtocol.test.ts` | quote escaping in injected commands, event validation, unknown events ignored |
| `mobile/src/lib/map/orderPins.test.ts` | stable pin ids, draw order, 0,0 rejected as an empty column |
| `mobile/src/lib/map/orderPoints.test.ts` | PostgREST numeric-as-string, empty string vs zero, genuine zero on one axis |
| `mobile/src/lib/map/mapsConfig.test.ts` | missing/scheme-less origin named loudly, LAN dev origins allowed |
| `mobile/src/lib/geocoding.test.ts` | requests go to the proxy not Apple, failure classification, cancellation vs failure |

## Failure behaviour

Unchanged in principle from the web: address entry never hard-fails. A build
with no `EXPO_PUBLIC_WEB_ORIGIN`, or a deployment with no `.p8`, leaves the
field editable, says so in one line, and stops searching — nothing the customer
types would fix it. A map that cannot load shows a panel saying so rather than
a grey rectangle.

A dropped pin whose reverse geocode fails still selects the location: the
coordinates are what the rider navigates to, and a coordinate label is a worse
name for the spot but not a blocking one.
