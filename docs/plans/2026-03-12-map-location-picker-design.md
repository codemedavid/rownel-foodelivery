# Map Location Picker Design

## Problem

The app lacks visual map feedback when selecting locations. Users can only search text addresses via Nominatim, with no way to visually confirm or adjust pin placement. Barangay-level searches often fail due to insufficient Nominatim query parameters.

## Solution

Add an interactive Leaflet map with a draggable pin to three locations in the app, and improve Nominatim search to return barangay-level results.

## Tech Stack

- **leaflet** + **react-leaflet** — interactive map with OpenStreetMap tiles (free, no API key)
- **Nominatim** (existing) — improved search parameters for better Philippines coverage

## Reusable Component: `MapLocationPicker`

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `latitude` | `number \| null` | `null` | Current pin latitude |
| `longitude` | `number \| null` | `null` | Current pin longitude |
| `onLocationSelect` | `(lat, lng, address) => void` | required | Callback when location changes |
| `showRadius` | `number \| undefined` | `undefined` | Delivery radius in km (renders circle) |
| `height` | `string` | `"300px"` | Map container height |
| `zoom` | `number` | `15` | Initial zoom level |
| `showSearch` | `boolean` | `true` | Show integrated search bar |

### Behavior

1. Search bar at top triggers Nominatim lookup
2. Selecting a result pans map and places draggable pin
3. Dragging pin triggers reverse geocode to update address text
4. Optional translucent circle shows delivery radius
5. Browser geolocation button for quick "use my location"

## Integration Points

| Screen | Component Usage | Radius | GPS Button |
|--------|----------------|--------|------------|
| Checkout | Draggable pin for delivery address | No | Yes |
| MerchantManager (admin) | Draggable pin for store location | Yes (maxDeliveryDistanceKm) | No |
| MerchantsList (homepage) | Draggable pin for "your location" | No | Yes |

## Nominatim Search Improvements

- Add `addressdetails=1` for granular address components
- Use `featuretype` param to include smaller admin areas
- Increase result limit from 5 to 8
- Add `viewbox` bias for Philippines bounding box
- Improve display name formatting to show barangay/municipality

## Data Flow

No database changes needed. Existing `latitude`, `longitude`, `formatted_address`, and `osm_place_id` fields are sufficient. The map component outputs the same data shape currently used by `AddressAutocompleteInput`.
