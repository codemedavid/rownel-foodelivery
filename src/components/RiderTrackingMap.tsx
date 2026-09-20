import React, { useEffect, useRef } from 'react';
import { Loader2, MapPinOff } from 'lucide-react';
import type { Annotation } from '@apple/mapkit-loader';
import { useMapkitMap, type MapPoint } from '../lib/mapkit/useMapkitMap';
import { loadMapkit } from '../lib/mapkit/loadMapkit';
import { createAmbientRiderPin, createDeliveryPin, createTrackedRiderPin } from './map/mapPins';

// Manila, as a neutral view when there is nothing specific to centre on.
const DEFAULT_LAT = 14.5995;
const DEFAULT_LNG = 120.9842;

// Web-mercator zoom levels, converted to the camera altitude MapKit expects.
const EQUATOR_METRES = 40_075_017;
const zoomToCameraDistance = (zoom: number): number => EQUATOR_METRES / 2 ** zoom;

const TRACKING_ZOOM = 16;
const AMBIENT_CENTERED_ZOOM = 14;
const AMBIENT_WIDE_ZOOM = 11;

export interface AmbientRider {
  id: string;
  latitude: number;
  longitude: number;
}

interface TrackingProps {
  mode: 'tracking';
  latitude: number;
  longitude: number;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  height?: string;
}

interface AmbientProps {
  mode: 'ambient';
  riders: AmbientRider[];
  centerLatitude?: number;
  centerLongitude?: number;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  height?: string;
}

type Props = TrackingProps | AmbientProps;

interface MapFrameProps {
  height: string;
  status: ReturnType<typeof useMapkitMap>['status'];
  containerRef: React.RefObject<HTMLDivElement>;
}

/** The bordered box every variant of this map is drawn inside. */
const MapFrame: React.FC<MapFrameProps> = ({ height, status, containerRef }) => (
  <div
    className="rounded-xl overflow-hidden border border-gray-200 relative z-0"
    style={{ height }}
  >
    <div ref={containerRef} className="h-full w-full" />

    {status === 'loading' && (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )}

    {status === 'failed' && (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gray-50 text-gray-500">
        <MapPinOff className="h-5 w-5" />
        <span className="text-xs">Live map unavailable</span>
      </div>
    )}
  </div>
);

/**
 * Adds a pin to the map and keeps it there for the component's lifetime.
 * Returns the annotation so a caller can move it as the rider travels.
 */
const useAnnotation = (
  map: ReturnType<typeof useMapkitMap>['map'],
  position: MapPoint | null,
  createElement: () => HTMLElement
): React.MutableRefObject<Annotation | null> => {
  const annotationRef = useRef<Annotation | null>(null);

  useEffect(() => {
    if (!map || !position) return;
    let isCancelled = false;

    const attach = async () => {
      const mapkit = await loadMapkit();
      if (isCancelled || annotationRef.current) return;

      const annotation = new mapkit.Annotation(position, createElement);
      map.addAnnotation(annotation);
      annotationRef.current = annotation;
    };

    void attach();
    return () => {
      isCancelled = true;
    };
    // Only the map's arrival should attach the pin; movement is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, position !== null]);

  // Move the existing pin rather than replacing it, so it glides with the rider.
  useEffect(() => {
    if (annotationRef.current && position) {
      annotationRef.current.coordinate = position;
    }
  }, [position]);

  return annotationRef;
};

const TrackingMap: React.FC<Omit<TrackingProps, 'mode'> & { height: string }> = ({
  latitude,
  longitude,
  deliveryLatitude,
  deliveryLongitude,
  height,
}) => {
  const riderPosition = { latitude, longitude };
  const deliveryPosition =
    deliveryLatitude != null && deliveryLongitude != null
      ? { latitude: deliveryLatitude, longitude: deliveryLongitude }
      : null;

  const { containerRef, map, status } = useMapkitMap({
    center: riderPosition,
    cameraDistance: zoomToCameraDistance(TRACKING_ZOOM),
    isInteractive: false,
  });

  useAnnotation(map, riderPosition, createTrackedRiderPin);
  useAnnotation(map, deliveryPosition, createDeliveryPin);

  // Follow the rider, but only once they have actually moved.
  const previousRef = useRef<MapPoint | null>(null);
  useEffect(() => {
    const previous = previousRef.current;
    const hasMoved =
      previous !== null && (previous.latitude !== latitude || previous.longitude !== longitude);

    if (hasMoved) map?.setCenterAnimated({ latitude, longitude }, true);
    previousRef.current = { latitude, longitude };
  }, [map, latitude, longitude]);

  return <MapFrame height={height} status={status} containerRef={containerRef} />;
};

const AmbientMap: React.FC<Omit<AmbientProps, 'mode'> & { height: string }> = ({
  riders,
  centerLatitude,
  centerLongitude,
  deliveryLatitude,
  deliveryLongitude,
  height,
}) => {
  const hasFocus = (centerLatitude ?? deliveryLatitude) !== undefined;
  const center = {
    latitude: centerLatitude ?? deliveryLatitude ?? DEFAULT_LAT,
    longitude: centerLongitude ?? deliveryLongitude ?? DEFAULT_LNG,
  };

  const { containerRef, map, status } = useMapkitMap({
    center,
    cameraDistance: zoomToCameraDistance(hasFocus ? AMBIENT_CENTERED_ZOOM : AMBIENT_WIDE_ZOOM),
    isInteractive: false,
  });

  const deliveryPosition =
    deliveryLatitude != null && deliveryLongitude != null
      ? { latitude: deliveryLatitude, longitude: deliveryLongitude }
      : null;
  useAnnotation(map, deliveryPosition, createDeliveryPin);

  // Riders come and go between polls, so this set is rebuilt rather than
  // diffed — there are only ever a handful on screen.
  const riderKey = riders.map((rider) => `${rider.id}:${rider.latitude},${rider.longitude}`).join('|');
  useEffect(() => {
    if (!map) return;
    let isCancelled = false;
    let attached: Annotation[] = [];

    const draw = async () => {
      const mapkit = await loadMapkit();
      if (isCancelled) return;

      attached = riders.map(
        (rider) =>
          new mapkit.Annotation(
            { latitude: rider.latitude, longitude: rider.longitude },
            createAmbientRiderPin
          )
      );
      if (attached.length > 0) map.addAnnotations(attached);
    };

    void draw();
    return () => {
      isCancelled = true;
      if (attached.length > 0) map.removeAnnotations(attached);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, riderKey]);

  return <MapFrame height={height} status={status} containerRef={containerRef} />;
};

const RiderTrackingMap: React.FC<Props> = (props) => {
  const { height = '220px' } = props;

  if (props.mode === 'tracking') {
    const { latitude, longitude, deliveryLatitude, deliveryLongitude } = props;
    return (
      <TrackingMap
        latitude={latitude}
        longitude={longitude}
        deliveryLatitude={deliveryLatitude}
        deliveryLongitude={deliveryLongitude}
        height={height}
      />
    );
  }

  const { riders, centerLatitude, centerLongitude, deliveryLatitude, deliveryLongitude } = props;
  return (
    <AmbientMap
      riders={riders}
      centerLatitude={centerLatitude}
      centerLongitude={centerLongitude}
      deliveryLatitude={deliveryLatitude}
      deliveryLongitude={deliveryLongitude}
      height={height}
    />
  );
};

export default RiderTrackingMap;
