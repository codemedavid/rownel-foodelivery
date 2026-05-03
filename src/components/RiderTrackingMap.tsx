import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';

delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const trackedRiderIcon = L.divIcon({
  className: '',
  html: `<div style="width:40px;height:40px;border-radius:50%;background:#dc2626;border:3px solid #fff;
    box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
      <path d="M15 6a1 1 0 0 0 0-2h-1l-5 8H4"/><path d="m6 17 3.5-7h8l1.5 7"/>
    </svg>
  </div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const ambientRiderIcon = L.divIcon({
  className: '',
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#f97316;border:2px solid #fff;
    box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;opacity:0.85;">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
      <path d="M15 6a1 1 0 0 0 0-2h-1l-5 8H4"/><path d="m6 17 3.5-7h8l1.5 7"/>
    </svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const deliveryPinIcon = L.divIcon({
  className: '',
  html: `<div style="width:32px;height:32px;border-radius:50%;background:#16a34a;border:2px solid #fff;
    box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
      fill="#fff" stroke="#fff" stroke-width="1">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const LivePan: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
  const map = useMap();
  const prevRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (prevRef.current && (prevRef.current.lat !== lat || prevRef.current.lng !== lng)) {
      map.panTo([lat, lng], { animate: true, duration: 1 });
    }
    prevRef.current = { lat, lng };
  }, [lat, lng, map]);
  return null;
};

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

const DEFAULT_LAT = 14.5995;
const DEFAULT_LNG = 120.9842;

const RiderTrackingMap: React.FC<Props> = (props) => {
  const { height = '220px' } = props;

  if (props.mode === 'tracking') {
    const { latitude, longitude, deliveryLatitude, deliveryLongitude } = props;
    return (
      <div className="rounded-xl overflow-hidden border border-gray-200 relative z-0" style={{ height }}>
        <MapContainer
          center={[latitude, longitude]}
          zoom={16}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <LivePan lat={latitude} lng={longitude} />
          <Marker position={[latitude, longitude]} icon={trackedRiderIcon} />
          {deliveryLatitude != null && deliveryLongitude != null && (
            <Marker position={[deliveryLatitude, deliveryLongitude]} icon={deliveryPinIcon} />
          )}
        </MapContainer>
      </div>
    );
  }

  // ambient mode
  const { riders, centerLatitude, centerLongitude, deliveryLatitude, deliveryLongitude } = props;
  const centerLat = centerLatitude ?? deliveryLatitude ?? DEFAULT_LAT;
  const centerLng = centerLongitude ?? deliveryLongitude ?? DEFAULT_LNG;
  const zoom = (centerLatitude ?? deliveryLatitude) ? 14 : 11;

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 relative z-0" style={{ height }}>
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {riders.map((r) => (
          <Marker key={r.id} position={[r.latitude, r.longitude]} icon={ambientRiderIcon} />
        ))}
        {deliveryLatitude != null && deliveryLongitude != null && (
          <Marker position={[deliveryLatitude, deliveryLongitude]} icon={deliveryPinIcon} />
        )}
      </MapContainer>
    </div>
  );
};

export default RiderTrackingMap;
