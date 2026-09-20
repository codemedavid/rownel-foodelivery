// Mounts a MapKit JS map into a React-owned container.
//
// MapKit's Map is imperative and long-lived: it is constructed once against a
// DOM element and mutated afterwards. This hook owns that lifecycle — creation,
// teardown, and the loading/failed states a component needs to render around it
// — so the map components stay declarative.
//
// The map is deliberately NOT rebuilt when its props change. Recentring is done
// by the caller through the returned map instance, which keeps the customer's
// current view instead of snapping it back on every parent render.

import { useEffect, useRef, useState } from 'react';
import type { CoordinateRegionData, Map as MapkitMap } from '@apple/mapkit-loader';
import { loadMapkit } from './loadMapkit';
import { logGeocodingError } from '../geocodingError';

export type MapkitMapStatus = 'loading' | 'ready' | 'failed';

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface UseMapkitMapOptions {
  /** Where the map opens. Later changes are the caller's to animate. */
  center: MapPoint;
  /** How far the camera sits above the ground, in metres. */
  cameraDistance: number;
  /** False for a display-only map the customer should not pan or zoom. */
  isInteractive?: boolean;
  /** Confines panning, so a pin can never be dropped outside the region. */
  cameraBoundary?: CoordinateRegionData | null;
  onClick?: (coordinate: MapPoint) => void;
}

export interface UseMapkitMapResult {
  containerRef: React.RefObject<HTMLDivElement>;
  map: MapkitMap | null;
  status: MapkitMapStatus;
}

export const useMapkitMap = ({
  center,
  cameraDistance,
  isInteractive = true,
  cameraBoundary = null,
  onClick,
}: UseMapkitMapOptions): UseMapkitMapResult => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapkitMap | null>(null);
  const [status, setStatus] = useState<MapkitMapStatus>('loading');

  // Held in a ref so a caller passing an inline arrow function does not tear
  // the map down and rebuild it on every render.
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  // Read once, at construction: these describe where the map opens, and
  // reacting to them here would fight the customer's own panning.
  const initialViewRef = useRef({ center, cameraDistance, isInteractive, cameraBoundary });

  useEffect(() => {
    let isCancelled = false;
    let created: MapkitMap | null = null;

    const build = async () => {
      try {
        const mapkit = await loadMapkit();
        const container = containerRef.current;
        // StrictMode mounts twice in development; the first pass may already
        // have been torn down by the time MapKit finishes loading.
        if (isCancelled || !container) return;

        const view = initialViewRef.current;
        created = new mapkit.Map(container, {
          center: view.center,
          cameraDistance: view.cameraDistance,
          isScrollEnabled: view.isInteractive,
          isZoomEnabled: view.isInteractive,
          isRotationEnabled: false,
          showsCompass: 'hidden',
          showsScale: 'hidden',
          showsZoomControl: view.isInteractive,
          showsMapTypeControl: false,
          ...(view.cameraBoundary ? { cameraBoundary: view.cameraBoundary } : {}),
        });

        created.addEventListener('click', (event: Event) => {
          const handle = onClickRef.current;
          if (!handle || !created) return;
          const { pointOnPage } = event as Event & { pointOnPage: DOMPoint };
          const coordinate = created.convertPointOnPageToCoordinate(pointOnPage);
          handle({ latitude: coordinate.latitude, longitude: coordinate.longitude });
        });

        setMap(created);
        setStatus('ready');
      } catch (error: unknown) {
        logGeocodingError('map initialisation', error);
        if (!isCancelled) setStatus('failed');
      }
    };

    void build();

    return () => {
      isCancelled = true;
      created?.destroy();
      setMap(null);
    };
  }, []);

  return { containerRef, map, status };
};
