import { Merchant } from '../types';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type MerchantWithDistance = Merchant & { distanceKm?: number };

/** Ignore background GPS refreshes that moved less than this — avoids re-sorting the list underfoot. */
export const LOCATION_REFRESH_THRESHOLD_KM = 0.25;

const EARTH_RADIUS_KM = 6371;

const degToRad = (deg: number): number => deg * (Math.PI / 180);

export const calculateDistanceKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

export const decorateAndFilterMerchantsByDistance = (
  merchants: Merchant[],
  userLocation: Coordinates | null
): MerchantWithDistance[] => {
  if (!userLocation) {
    return merchants as MerchantWithDistance[];
  }

  return merchants
    .map((merchant) => {
      if (typeof merchant.latitude === 'number' && typeof merchant.longitude === 'number') {
        const distanceKm = calculateDistanceKm(
          userLocation.latitude,
          userLocation.longitude,
          merchant.latitude,
          merchant.longitude
        );
        return { ...merchant, distanceKm } as MerchantWithDistance;
      }
      return merchant as MerchantWithDistance;
    })
    .filter((merchant) => {
      if (typeof merchant.distanceKm !== 'number') return false;
      const maxDistanceKm = merchant.maxDeliveryDistanceKm ?? null;
      return maxDistanceKm == null || merchant.distanceKm <= maxDistanceKm;
    })
    .sort(
      (a, b) =>
        (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY)
    );
};

export const hasMovedBeyondThreshold = (
  from: Coordinates,
  to: Coordinates,
  accuracySlackKm = 0
): boolean =>
  calculateDistanceKm(from.latitude, from.longitude, to.latitude, to.longitude) >
  LOCATION_REFRESH_THRESHOLD_KM + accuracySlackKm;
