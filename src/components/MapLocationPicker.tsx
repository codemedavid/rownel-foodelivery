import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, Source, type MapRef, type MapMouseEvent } from 'react-map-gl/mapbox';
import { MapPin, Navigation, Loader2 } from 'lucide-react';
import { reverseGeocode } from '../lib/geocoding';
import type { AddressSuggestion } from '../lib/geocoding';
import { createCirclePolygon } from '../lib/geoCircle';
import AddressAutocompleteInput from './AddressAutocompleteInput';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';

const DEFAULT_LAT = 14.5995;
const DEFAULT_LNG = 120.9842;
const DEFAULT_ZOOM = 6;
const FLY_TO_DURATION_MS = 800;

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
  const mapRef = useRef<MapRef>(null);

  const hasCoordinates = latitude !== null && longitude !== null;
  const initialLat = hasCoordinates ? latitude : DEFAULT_LAT;
  const initialLng = hasCoordinates ? longitude : DEFAULT_LNG;
  const initialZoom = hasCoordinates ? zoom : DEFAULT_ZOOM;

  const [searchValue, setSearchValue] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  // Local marker position gives immediate visual feedback, so the pin never
  // snaps back while the reverse geocode is still in flight.
  const [markerPos, setMarkerPos] = useState<{ latitude: number; longitude: number } | null>(
    hasCoordinates ? { latitude, longitude } : null
  );

  const flyTo = useCallback((lat: number, lng: number, nextZoom?: number) => {
    // Mapbox takes [lng, lat] — the opposite order to the rest of this app.
    mapRef.current?.flyTo({
      center: [lng, lat],
      ...(nextZoom === undefined ? {} : { zoom: nextZoom }),
      duration: FLY_TO_DURATION_MS,
    });
  }, []);

  // Sync when the parent pushes new coordinates (e.g. its own search field).
  useEffect(() => {
    if (!hasCoordinates) return;
    setMarkerPos({ latitude, longitude });
    flyTo(latitude, longitude, zoom);
  }, [latitude, longitude, hasCoordinates, zoom, flyTo]);

  const handlePinMove = useCallback(
    async (lat: number, lng: number) => {
      setMarkerPos({ latitude: lat, longitude: lng });
      flyTo(lat, lng);

      const fallbackLabel = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      try {
        const result = await reverseGeocode(lat, lng);
        onLocationSelect(lat, lng, result.displayName, result.placeId);
        if (showSearch) setSearchValue(result.displayName);
      } catch {
        onLocationSelect(lat, lng, fallbackLabel, '');
        if (showSearch) setSearchValue(fallbackLabel);
      }
    },
    [onLocationSelect, showSearch, flyTo]
  );

  const handleMapClick = useCallback(
    (event: MapMouseEvent) => {
      handlePinMove(event.lngLat.lat, event.lngLat.lng);
    },
    [handlePinMove]
  );

  const handleSearchSelect = useCallback(
    (suggestion: AddressSuggestion) => {
      setMarkerPos({ latitude: suggestion.latitude, longitude: suggestion.longitude });
      flyTo(suggestion.latitude, suggestion.longitude, zoom);
      onLocationSelect(
        suggestion.latitude,
        suggestion.longitude,
        suggestion.displayName,
        suggestion.placeId
      );
    },
    [onLocationSelect, zoom, flyTo]
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

  const radiusPolygon = useMemo(() => {
    if (!markerPos || !showRadius || showRadius <= 0) return null;
    return createCirclePolygon(markerPos.latitude, markerPos.longitude, showRadius);
  }, [markerPos, showRadius]);

  return (
    <div className="space-y-3">
      {/* Prominent full-width GPS button when no search bar */}
      {showGpsButton && !showSearch && (
        <button
          type="button"
          onClick={handleUseGps}
          disabled={isLocating}
          className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-blue-500 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 active:bg-blue-200 disabled:opacity-50 transition-colors"
        >
          {isLocating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Navigation className="h-4 w-4" />
          )}
          {isLocating ? 'Getting your location…' : 'Use My Current Location'}
        </button>
      )}

      {/* Search + compact GPS button when search is visible */}
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

      <div className="rounded-lg overflow-hidden border border-gray-200 relative z-0" style={{ height }}>
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={MAP_STYLE}
          initialViewState={{
            latitude: initialLat,
            longitude: initialLng,
            zoom: initialZoom,
          }}
          style={{ height: '100%', width: '100%' }}
          onClick={handleMapClick}
          scrollZoom
        >
          {radiusPolygon && (
            <Source id="delivery-radius" type="geojson" data={radiusPolygon}>
              <Layer
                id="delivery-radius-fill"
                type="fill"
                paint={{ 'fill-color': '#22c55e', 'fill-opacity': 0.1 }}
              />
              <Layer
                id="delivery-radius-outline"
                type="line"
                paint={{ 'line-color': '#16a34a', 'line-width': 2 }}
              />
            </Source>
          )}

          {markerPos && (
            <Marker
              latitude={markerPos.latitude}
              longitude={markerPos.longitude}
              anchor="bottom"
              draggable
              onDragEnd={(event) => handlePinMove(event.lngLat.lat, event.lngLat.lng)}
            >
              <MapPin className="h-8 w-8 text-red-600 drop-shadow-md" fill="#dc2626" strokeWidth={1.5} />
            </Marker>
          )}
        </Map>
      </div>

      {!markerPos && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          Search for an address or click the map to place a pin.
        </p>
      )}
    </div>
  );
};

export default MapLocationPicker;
