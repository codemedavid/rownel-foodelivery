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
