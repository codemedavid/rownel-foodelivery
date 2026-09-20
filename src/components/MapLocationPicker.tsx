import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, Loader2, AlertTriangle } from 'lucide-react';
import { reverseGeocode, PHILIPPINES_REGION } from '../lib/geocoding';
import type { AddressSuggestion } from '../lib/geocoding';
import { logGeocodingError } from '../lib/geocodingError';
import { useMapkitMap, type MapPoint } from '../lib/mapkit/useMapkitMap';
import { loadMapkit } from '../lib/mapkit/loadMapkit';
import type { Annotation, CircleOverlay } from '@apple/mapkit-loader';
import { createLocationPin } from './map/mapPins';
import AddressAutocompleteInput from './AddressAutocompleteInput';

// Manila, as a neutral opening view when the customer has no address yet.
const DEFAULT_LAT = 14.5995;
const DEFAULT_LNG = 120.9842;

// MapKit frames the view by camera altitude in metres, while callers here (and
// the rest of the web) think in web-mercator zoom levels. Halving the earth's
// circumference per level is the standard correspondence between the two.
const EQUATOR_METRES = 40_075_017;
const zoomToCameraDistance = (zoom: number): number => EQUATOR_METRES / 2 ** zoom;

const DEFAULT_ZOOM = 6;
const SELECTED_ZOOM = 15;

const GPS_TIMEOUT_MS = 10_000;

interface MapLocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  onLocationSelect: (lat: number, lng: number, address: string, placeId: string) => void;
  showRadius?: number;
  height?: string;
  /** Web-mercator zoom level to frame a chosen location at. */
  zoom?: number;
  showSearch?: boolean;
  showGpsButton?: boolean;
  searchPlaceholder?: string;
}

const MapLocationPicker: React.FC<MapLocationPickerProps> = ({
  latitude,
  longitude,
  onLocationSelect,
  showRadius,
  height = '300px',
  zoom = SELECTED_ZOOM,
  showSearch = true,
  showGpsButton = false,
  searchPlaceholder = 'Search for a location...',
}) => {
  const hasCoordinates = latitude !== null && longitude !== null;

  const [searchValue, setSearchValue] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  // Local marker position gives immediate visual feedback, so the pin never
  // snaps back while the reverse geocode is still in flight.
  const [markerPos, setMarkerPos] = useState<MapPoint | null>(
    hasCoordinates ? { latitude, longitude } : null
  );

  // Kept in a ref so the map's click handler, bound once at construction,
  // always reaches the current callback rather than the first render's.
  const onLocationSelectRef = useRef(onLocationSelect);
  onLocationSelectRef.current = onLocationSelect;
  const showSearchRef = useRef(showSearch);
  showSearchRef.current = showSearch;

  const handlePinMove = useCallback(async (lat: number, lng: number) => {
    setMarkerPos({ latitude: lat, longitude: lng });

    const fallbackLabel = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    try {
      const result = await reverseGeocode(lat, lng);
      onLocationSelectRef.current(lat, lng, result.displayName, result.placeId);
      if (showSearchRef.current) setSearchValue(result.displayName);
    } catch (error: unknown) {
      // The pin still carries the coordinates the rider needs, so the drop
      // succeeds with a coordinate label rather than failing outright.
      logGeocodingError('reverse geocode', error);
      onLocationSelectRef.current(lat, lng, fallbackLabel, '');
      if (showSearchRef.current) setSearchValue(fallbackLabel);
    }
  }, []);

  const handleMapClick = useCallback(
    (coordinate: MapPoint) => {
      void handlePinMove(coordinate.latitude, coordinate.longitude);
    },
    [handlePinMove]
  );

  const { containerRef, map, status } = useMapkitMap({
    center: hasCoordinates ? { latitude, longitude } : { latitude: DEFAULT_LAT, longitude: DEFAULT_LNG },
    cameraDistance: zoomToCameraDistance(hasCoordinates ? zoom : DEFAULT_ZOOM),
    // Panning stops at the coastline rather than letting a pin be dropped abroad.
    cameraBoundary: PHILIPPINES_REGION,
    onClick: handleMapClick,
  });

  // The draggable pin lives on the map, not in React's tree, so it is created
  // once and then moved as the chosen location changes.
  const annotationRef = useRef<Annotation | null>(null);

  useEffect(() => {
    if (!map || !markerPos) return;
    let isCancelled = false;

    const place = async () => {
      const mapkit = await loadMapkit();
      if (isCancelled) return;

      if (!annotationRef.current) {
        const annotation = new mapkit.Annotation(markerPos, createLocationPin, {
          draggable: true,
          anchorOffset: new DOMPoint(0, -16),
        });
        annotation.addEventListener('drag-end', () => {
          const { latitude: lat, longitude: lng } = annotation.coordinate;
          void handlePinMove(lat, lng);
        });
        map.addAnnotation(annotation);
        annotationRef.current = annotation;
        return;
      }

      annotationRef.current.coordinate = markerPos;
    };

    void place();
    return () => {
      isCancelled = true;
    };
  }, [map, markerPos, handlePinMove]);

  // Follow the chosen location, and frame it at street level once there is one.
  useEffect(() => {
    if (!map || !markerPos) return;
    map.setCenterAnimated(markerPos, true);
  }, [map, markerPos]);

  // Draw the delivery radius as a real circle rather than a polygon estimate.
  useEffect(() => {
    if (!map || !markerPos || !showRadius || showRadius <= 0) return;
    let isCancelled = false;
    let overlay: CircleOverlay | null = null;

    const draw = async () => {
      const mapkit = await loadMapkit();
      if (isCancelled) return;

      overlay = new mapkit.CircleOverlay(markerPos, showRadius, {
        style: new mapkit.Style({
          fillColor: '#22c55e',
          fillOpacity: 0.1,
          strokeColor: '#16a34a',
          lineWidth: 2,
        }),
      });
      map.addOverlay(overlay);
    };

    void draw();
    return () => {
      isCancelled = true;
      if (overlay) map.removeOverlay(overlay);
    };
  }, [map, markerPos, showRadius]);

  // Sync when the parent pushes new coordinates (e.g. its own search field).
  useEffect(() => {
    if (!hasCoordinates) return;
    setMarkerPos({ latitude, longitude });
  }, [latitude, longitude, hasCoordinates]);

  const handleSearchSelect = useCallback(
    (suggestion: AddressSuggestion) => {
      setMarkerPos({ latitude: suggestion.latitude, longitude: suggestion.longitude });
      onLocationSelectRef.current(
        suggestion.latitude,
        suggestion.longitude,
        suggestion.displayName,
        suggestion.placeId
      );
    },
    []
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
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS }
    );
  }, [handlePinMove]);

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
              proximity={markerPos}
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

      <div
        className="rounded-lg overflow-hidden border border-gray-200 relative z-0"
        style={{ height }}
      >
        <div ref={containerRef} className="h-full w-full" data-testid="mapkit-container" />

        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        )}

        {status === 'failed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50/95 p-4 text-center">
            <p className="flex flex-col items-center gap-2 text-xs text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              <span>
                The map could not load. Type your address above — delivery still works without it.
              </span>
            </p>
          </div>
        )}
      </div>

      {!markerPos && status !== 'failed' && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          Search for an address or tap the map to place a pin.
        </p>
      )}
    </div>
  );
};

export default MapLocationPicker;
