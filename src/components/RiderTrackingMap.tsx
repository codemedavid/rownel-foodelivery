import React, { useEffect, useRef } from 'react';
import Map, { Marker, type MapRef } from 'react-map-gl/mapbox';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';

const DEFAULT_LAT = 14.5995;
const DEFAULT_LNG = 120.9842;
const TRACKING_ZOOM = 16;
const AMBIENT_CENTERED_ZOOM = 14;
const AMBIENT_WIDE_ZOOM = 11;
const PAN_DURATION_MS = 1000;

const BikeGlyph: React.FC<{ size: number; strokeWidth: number }> = ({ size, strokeWidth }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fff"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="5.5" cy="17.5" r="3.5" />
    <circle cx="18.5" cy="17.5" r="3.5" />
    <path d="M15 6a1 1 0 0 0 0-2h-1l-5 8H4" />
    <path d="m6 17 3.5-7h8l1.5 7" />
  </svg>
);

const TrackedRiderPin: React.FC = () => (
  <div className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-red-600 shadow-lg">
    <BikeGlyph size={20} strokeWidth={2} />
  </div>
);

const AmbientRiderPin: React.FC = () => (
  <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-orange-500 opacity-85 shadow-md">
    <BikeGlyph size={14} strokeWidth={2.5} />
  </div>
);

const DeliveryPin: React.FC = () => (
  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-green-600 shadow-md">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="#fff"
      stroke="#fff"
      strokeWidth="1"
    >
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  </div>
);

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

interface BaseMapProps {
  latitude: number;
  longitude: number;
  zoom: number;
  height: string;
  children: React.ReactNode;
}

const StaticMap: React.FC<BaseMapProps> = ({ latitude, longitude, zoom, height, children }) => (
  <div className="rounded-xl overflow-hidden border border-gray-200 relative z-0" style={{ height }}>
    <Map
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle={MAP_STYLE}
      initialViewState={{ latitude, longitude, zoom }}
      style={{ height: '100%', width: '100%' }}
      scrollZoom={false}
      attributionControl={false}
      dragRotate={false}
    >
      {children}
    </Map>
  </div>
);

const TrackingMap: React.FC<Omit<TrackingProps, 'mode'> & { height: string }> = ({
  latitude,
  longitude,
  deliveryLatitude,
  deliveryLongitude,
  height,
}) => {
  const mapRef = useRef<MapRef>(null);
  const previousRef = useRef<{ latitude: number; longitude: number } | null>(null);

  // Follow the rider, but only once they have actually moved.
  useEffect(() => {
    const previous = previousRef.current;
    const hasMoved =
      previous !== null && (previous.latitude !== latitude || previous.longitude !== longitude);

    if (hasMoved) {
      mapRef.current?.panTo([longitude, latitude], { duration: PAN_DURATION_MS });
    }
    previousRef.current = { latitude, longitude };
  }, [latitude, longitude]);

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 relative z-0" style={{ height }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAP_STYLE}
        initialViewState={{ latitude, longitude, zoom: TRACKING_ZOOM }}
        style={{ height: '100%', width: '100%' }}
        scrollZoom={false}
        attributionControl={false}
        dragRotate={false}
      >
        <Marker latitude={latitude} longitude={longitude} anchor="center">
          <TrackedRiderPin />
        </Marker>
        {deliveryLatitude != null && deliveryLongitude != null && (
          <Marker latitude={deliveryLatitude} longitude={deliveryLongitude} anchor="bottom">
            <DeliveryPin />
          </Marker>
        )}
      </Map>
    </div>
  );
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
  const centerLat = centerLatitude ?? deliveryLatitude ?? DEFAULT_LAT;
  const centerLng = centerLongitude ?? deliveryLongitude ?? DEFAULT_LNG;
  const zoom =
    (centerLatitude ?? deliveryLatitude) !== undefined ? AMBIENT_CENTERED_ZOOM : AMBIENT_WIDE_ZOOM;

  return (
    <StaticMap latitude={centerLat} longitude={centerLng} zoom={zoom} height={height}>
      {riders.map((rider) => (
        <Marker key={rider.id} latitude={rider.latitude} longitude={rider.longitude} anchor="center">
          <AmbientRiderPin />
        </Marker>
      ))}
      {deliveryLatitude != null && deliveryLongitude != null && (
        <Marker latitude={deliveryLatitude} longitude={deliveryLongitude} anchor="bottom">
          <DeliveryPin />
        </Marker>
      )}
    </StaticMap>
  );
};

export default RiderTrackingMap;
