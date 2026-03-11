# Map Location Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an interactive Leaflet map with draggable pin to Checkout, MerchantManager, and MerchantsList, and improve Nominatim search for barangay-level results.

**Architecture:** A single reusable `MapLocationPicker` component wraps `react-leaflet` with integrated search. It outputs `(lat, lng, address)` — the same shape already consumed by existing code. The component is dropped into 3 screens with minimal wiring. Nominatim query params are tuned for Philippines granularity.

**Tech Stack:** React 18, TypeScript, Leaflet + react-leaflet, Nominatim (OSM), Tailwind CSS

---

### Task 1: Install Leaflet and react-leaflet dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install packages**

Run:
```bash
npm install leaflet react-leaflet
npm install -D @types/leaflet
```

**Step 2: Verify installation**

Run: `npm ls leaflet react-leaflet`
Expected: Both packages listed without errors.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install leaflet and react-leaflet dependencies"
```

---

### Task 2: Add Leaflet CSS import

**Files:**
- Modify: `index.html` (add Leaflet CSS CDN link)

**Step 1: Add Leaflet CSS**

Add to `<head>` in `index.html`:
```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
  crossorigin="" />
```

**Step 2: Verify by running dev server**

Run: `npm run dev`
Expected: No CSS errors, app loads normally.

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add Leaflet CSS to index.html"
```

---

### Task 3: Improve Nominatim search for barangay-level results

**Files:**
- Modify: `src/lib/osm.ts`

**Step 1: Update `searchAddresses` function**

Replace the current `searchAddresses` function with improved parameters:

```typescript
export const searchAddresses = async (
  query: string,
  options?: { limit?: number; countryCodes?: string[] }
): Promise<OSMAddressSuggestion[]> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const params = new URLSearchParams({
    q: trimmed,
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(options?.limit ?? 8),
    dedupe: '1',
  });

  // Philippines bounding box bias for better local results
  if (options?.countryCodes?.includes('ph')) {
    params.set('viewbox', '116.9283,4.5873,126.6042,21.3218');
    params.set('bounded', '0');
  }

  if (options?.countryCodes && options.countryCodes.length > 0) {
    params.set('countrycodes', options.countryCodes.join(','));
  }

  const response = await fetch(`${NOMINATIM_BASE_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch address suggestions');
  }

  const data = (await response.json()) as NominatimDetailedResult[];
  return (data || [])
    .filter((item) => item.display_name && item.lat && item.lon)
    .map((item) => ({
      placeId: String(item.place_id),
      displayName: formatDisplayName(item),
      latitude: Number(item.lat),
      longitude: Number(item.lon),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.latitude) &&
        Number.isFinite(item.longitude) &&
        Boolean(item.displayName)
    );
};
```

**Step 2: Add the NominatimDetailedResult interface and formatDisplayName helper**

Add above `searchAddresses`:

```typescript
interface NominatimDetailedResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    footway?: string;
    path?: string;
    street?: string;
    neighbourhood?: string;
    suburb?: string;
    village?: string;
    town?: string;
    city?: string;
    municipality?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

const formatDisplayName = (item: NominatimDetailedResult): string => {
  if (!item.address) return item.display_name;

  const addr = item.address;
  const parts = [
    addr.house_number,
    addr.road || addr.pedestrian || addr.street,
    addr.neighbourhood,
    addr.suburb,
    addr.village || addr.town || addr.municipality,
    addr.city,
    addr.county,
    addr.state,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : item.display_name;
};
```

**Step 3: Verify search works**

Run: `npm run dev`
Test: Search for a barangay name in the existing autocomplete. Should return more granular results.

**Step 4: Commit**

```bash
git add src/lib/osm.ts
git commit -m "feat: improve Nominatim search with viewbox bias and better formatting"
```

---

### Task 4: Create the reusable MapLocationPicker component

**Files:**
- Create: `src/components/MapLocationPicker.tsx`

**Step 1: Create the component**

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Navigation, Loader2 } from 'lucide-react';
import { reverseGeocode } from '../lib/osm';
import type { OSMAddressSuggestion } from '../lib/osm';
import AddressAutocompleteInput from './AddressAutocompleteInput';

// Fix Leaflet default marker icon issue with bundlers
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface MapLocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  onLocationSelect: (lat: number, lng: number, address: string, placeId: string) => void;
  showRadius?: number;
  height?: string;
  zoom?: number;
  showSearch?: boolean;
  showGpsButton?: boolean;
  searchPlaceholder?: string;
  countryCodes?: string[];
}

// Sub-component: handles map click events and draggable marker
const DraggableMarker: React.FC<{
  position: [number, number];
  onDragEnd: (lat: number, lng: number) => void;
  onMapClick: (lat: number, lng: number) => void;
}> = ({ position, onDragEnd, onMapClick }) => {
  const markerRef = useRef<L.Marker>(null);

  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });

  const handleDragEnd = useCallback(() => {
    const marker = markerRef.current;
    if (marker) {
      const latlng = marker.getLatLng();
      onDragEnd(latlng.lat, latlng.lng);
    }
  }, [onDragEnd]);

  return (
    <Marker
      draggable
      position={position}
      ref={markerRef}
      eventHandlers={{ dragend: handleDragEnd }}
    />
  );
};

// Sub-component: pans map to new center when coordinates change
const MapUpdater: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.8 });
  }, [center, zoom, map]);
  return null;
};

const MapLocationPicker: React.FC<MapLocationPickerProps> = ({
  latitude,
  longitude,
  onLocationSelect,
  showRadius,
  height = '300px',
  zoom = 15,
  showSearch = true,
  showGpsButton = false,
  searchPlaceholder = 'Search for a location...',
  countryCodes = ['ph'],
}) => {
  // Default center: Philippines (Manila) if no coordinates provided
  const defaultLat = 14.5995;
  const defaultLng = 120.9842;
  const defaultZoom = 6;

  const hasCoordinates = latitude !== null && longitude !== null;
  const currentLat = hasCoordinates ? latitude : defaultLat;
  const currentLng = hasCoordinates ? longitude : defaultLng;
  const currentZoom = hasCoordinates ? zoom : defaultZoom;

  const [searchValue, setSearchValue] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([currentLat, currentLng]);
  const [mapZoom, setMapZoom] = useState(currentZoom);

  // Update map center when external coordinates change
  useEffect(() => {
    if (hasCoordinates) {
      setMapCenter([latitude, longitude]);
      setMapZoom(zoom);
    }
  }, [latitude, longitude, hasCoordinates, zoom]);

  const handlePinMove = useCallback(
    async (lat: number, lng: number) => {
      setMapCenter([lat, lng]);
      try {
        const result = await reverseGeocode(lat, lng);
        onLocationSelect(lat, lng, result.displayName, result.placeId);
        setSearchValue(result.displayName);
      } catch {
        onLocationSelect(lat, lng, `${lat.toFixed(6)}, ${lng.toFixed(6)}`, '');
        setSearchValue(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      }
    },
    [onLocationSelect]
  );

  const handleSearchSelect = useCallback(
    (suggestion: OSMAddressSuggestion) => {
      setMapCenter([suggestion.latitude, suggestion.longitude]);
      setMapZoom(zoom);
      onLocationSelect(suggestion.latitude, suggestion.longitude, suggestion.displayName, suggestion.placeId);
    },
    [onLocationSelect, zoom]
  );

  const handleUseGps = useCallback(() => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        await handlePinMove(coords.latitude, coords.longitude);
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [handlePinMove]);

  return (
    <div className="space-y-3">
      {showSearch && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <AddressAutocompleteInput
              label=""
              value={searchValue}
              onChange={setSearchValue}
              onSelect={handleSearchSelect}
              placeholder={searchPlaceholder}
              rows={1}
              countryCodes={countryCodes}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          {showGpsButton && (
            <button
              type="button"
              onClick={handleUseGps}
              disabled={isLocating}
              className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title="Use my current location"
            >
              {isLocating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Navigation className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      )}

      <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height }}>
        <MapContainer
          center={[currentLat, currentLng]}
          zoom={currentZoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapUpdater center={mapCenter} zoom={mapZoom} />
          {hasCoordinates && (
            <>
              <DraggableMarker
                position={[latitude, longitude]}
                onDragEnd={handlePinMove}
                onMapClick={handlePinMove}
              />
              {showRadius && showRadius > 0 && (
                <Circle
                  center={[latitude, longitude]}
                  radius={showRadius * 1000}
                  pathOptions={{
                    color: '#16a34a',
                    fillColor: '#22c55e',
                    fillOpacity: 0.1,
                    weight: 2,
                  }}
                />
              )}
            </>
          )}
          {!hasCoordinates && (
            <div className="leaflet-top leaflet-horizontally-center" style={{ pointerEvents: 'none' }}>
              {/* Hint overlay rendered outside map via CSS */}
            </div>
          )}
        </MapContainer>
      </div>

      {!hasCoordinates && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          Search for an address or click the map to place a pin.
        </p>
      )}
    </div>
  );
};

export default MapLocationPicker;
```

**Step 2: Verify component renders**

Run: `npm run dev`
Temporarily import and render `<MapLocationPicker latitude={null} longitude={null} onLocationSelect={() => {}} />` in any page to check it loads. Remove after verification.

**Step 3: Commit**

```bash
git add src/components/MapLocationPicker.tsx
git commit -m "feat: create reusable MapLocationPicker component with draggable pin"
```

---

### Task 5: Integrate MapLocationPicker into Checkout

**Files:**
- Modify: `src/components/Checkout.tsx`

**Step 1: Add import**

Add at top of file:
```typescript
import MapLocationPicker from './MapLocationPicker';
```

**Step 2: Add map below the AddressAutocompleteInput**

After the existing `AddressAutocompleteInput` block and its validation message (around line 433), add:

```tsx
<MapLocationPicker
  latitude={deliveryLatitude}
  longitude={deliveryLongitude}
  onLocationSelect={(lat, lng, address, placeId) => {
    setDeliveryLatitude(lat);
    setDeliveryLongitude(lng);
    setDeliveryOsmPlaceId(placeId);
    setAddress(address);
  }}
  showSearch={false}
  showGpsButton
  height="250px"
  zoom={16}
/>
```

Note: `showSearch={false}` because the existing `AddressAutocompleteInput` above already handles search. The map just shows the pin and allows dragging.

**Step 3: Verify checkout map works**

Run: `npm run dev`
Test: Go to checkout, enter an address, verify pin appears on map. Drag pin, verify address updates.

**Step 4: Commit**

```bash
git add src/components/Checkout.tsx
git commit -m "feat: integrate map location picker into checkout page"
```

---

### Task 6: Integrate MapLocationPicker into MerchantManager

**Files:**
- Modify: `src/components/MerchantManager.tsx`

**Step 1: Add import**

Add at top of file:
```typescript
import MapLocationPicker from './MapLocationPicker';
```

**Step 2: Add map after the existing AddressAutocompleteInput block**

In the merchant delivery address section (around line 1273, after the "Location pinned" / "No pinned location" indicators), add:

```tsx
<div className="mt-3">
  <MapLocationPicker
    latitude={merchantFormData.latitude ?? null}
    longitude={merchantFormData.longitude ?? null}
    onLocationSelect={(lat, lng, address, placeId) => {
      setMerchantFormData({
        ...merchantFormData,
        latitude: lat,
        longitude: lng,
        address: address,
        formattedAddress: address,
        osmPlaceId: placeId,
      });
      setMerchantFormErrors({ ...merchantFormErrors, address: undefined });
    }}
    showSearch={false}
    showRadius={merchantFormData.maxDeliveryDistanceKm ?? undefined}
    height="280px"
    zoom={16}
  />
</div>
```

**Step 3: Verify merchant manager map works**

Run: `npm run dev`
Test: Open admin, edit/add a merchant, search for address, verify pin + radius circle appear.

**Step 4: Commit**

```bash
git add src/components/MerchantManager.tsx
git commit -m "feat: integrate map location picker into merchant manager with radius circle"
```

---

### Task 7: Integrate MapLocationPicker into MerchantsList location editor

**Files:**
- Modify: `src/components/MerchantsList.tsx`

**Step 1: Add import**

Add at top of file:
```typescript
import MapLocationPicker from './MapLocationPicker';
```

**Step 2: Add map inside the location editor modal**

In the `isLocationEditorOpen` modal (around line 806, after the `AddressAutocompleteInput` and before `manualLocationError`), add:

```tsx
<div className="mt-3">
  <MapLocationPicker
    latitude={selectedManualLocation?.latitude ?? userLocation?.latitude ?? null}
    longitude={selectedManualLocation?.longitude ?? userLocation?.longitude ?? null}
    onLocationSelect={(lat, lng, address, placeId) => {
      setSelectedManualLocation({
        placeId,
        displayName: address,
        latitude: lat,
        longitude: lng,
      });
      setManualLocationInput(address);
      setManualLocationError(null);
    }}
    showSearch={false}
    showGpsButton={false}
    height="220px"
    zoom={15}
  />
</div>
```

Note: The existing `AddressAutocompleteInput` and GPS button in the modal remain — the map augments them.

**Step 3: Verify merchants list map works**

Run: `npm run dev`
Test: Click "Set your location" on homepage, verify map appears in modal with pin. Drag pin, verify selection updates.

**Step 4: Commit**

```bash
git add src/components/MerchantsList.tsx
git commit -m "feat: integrate map location picker into merchants list location editor"
```

---

### Task 8: Build verification and final cleanup

**Files:**
- None new

**Step 1: Run production build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

**Step 2: Run lint**

Run: `npm run lint`
Expected: No new lint errors introduced.

**Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address build/lint issues from map integration"
```
