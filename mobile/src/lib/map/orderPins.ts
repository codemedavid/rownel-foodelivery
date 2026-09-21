// Builds the pin list for an order's map.
//
// Three screens draw the same map from different data — the customer watching
// their rider, the rider looking at a job, and an admin checking one — so the
// rule for what appears, and under which id, lives here rather than three times
// over in JSX.
//
// Ids are stable and describe the role, not the position. That is what lets the
// map move a rider's existing pin as they travel instead of removing and
// re-adding it, which would make the pin blink on every update.

import type { MapPin, MapPoint } from './mapEmbedProtocol';

export const PIN_IDS = {
  rider: 'rider',
  merchant: 'merchant',
  destination: 'destination',
} as const;

/** Prefix for the other riders shown while one is being found. */
const AMBIENT_PREFIX = 'ambient-';

export interface AmbientRider extends MapPoint {
  id: string;
}

export interface OrderMapPoints {
  /** The rider assigned to this order, once they are sharing a location. */
  rider?: MapPoint | null;
  /** Where the order is collected from. */
  merchant?: MapPoint | null;
  /** Where the order is going. */
  destination?: MapPoint | null;
  /** Other riders in the area, shown while one is still being found. */
  ambientRiders?: AmbientRider[];
}

const isUsable = (point: MapPoint | null | undefined): point is MapPoint =>
  !!point &&
  Number.isFinite(point.latitude) &&
  Number.isFinite(point.longitude) &&
  // 0,0 is a real coordinate in the Gulf of Guinea, and it is also what a
  // missing column looks like once it has been through Number().
  !(point.latitude === 0 && point.longitude === 0);

/** Every pin an order's map should currently show, in draw order. */
export const buildOrderPins = ({
  rider,
  merchant,
  destination,
  ambientRiders = [],
}: OrderMapPoints): MapPin[] => {
  const pins: MapPin[] = [];

  // Ambient riders first, so a real pin always draws over them.
  for (const ambient of ambientRiders) {
    if (!isUsable(ambient)) continue;
    pins.push({
      id: `${AMBIENT_PREFIX}${ambient.id}`,
      kind: 'ambient-rider',
      latitude: ambient.latitude,
      longitude: ambient.longitude,
    });
  }

  if (isUsable(merchant)) {
    pins.push({ id: PIN_IDS.merchant, kind: 'merchant', ...merchant });
  }

  if (isUsable(destination)) {
    pins.push({ id: PIN_IDS.destination, kind: 'delivery', ...destination });
  }

  if (isUsable(rider)) {
    pins.push({ id: PIN_IDS.rider, kind: 'tracked-rider', ...rider });
  }

  return pins;
};

/**
 * Where the map should open. The rider is the subject when there is one;
 * otherwise the destination, then the merchant. Returns null when there is
 * nothing worth centring on, so the caller can fall back to a neutral view.
 */
export const pickMapCenter = ({
  rider,
  merchant,
  destination,
}: OrderMapPoints): MapPoint | null => {
  for (const candidate of [rider, destination, merchant]) {
    if (isUsable(candidate)) return { latitude: candidate.latitude, longitude: candidate.longitude };
  }
  return null;
};

/** True when there is at least one pin worth drawing a map for. */
export const hasMappablePoints = (points: OrderMapPoints): boolean =>
  buildOrderPins(points).length > 0;
