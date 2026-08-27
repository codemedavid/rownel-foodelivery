import { calculateDistance, Coordinates } from './geolocation';
import { Merchant } from '../types';

export type MerchantWithDistance = Merchant & { distanceKm?: number };

/** Ignore background GPS refreshes that moved less than this — avoids re-sorting the list underfoot. */
export const LOCATION_REFRESH_THRESHOLD_KM = 0.25;

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
        const distanceKm = calculateDistance(
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
    });
};

export const hasMovedBeyondThreshold = (from: Coordinates, to: Coordinates): boolean =>
  calculateDistance(from.latitude, from.longitude, to.latitude, to.longitude) >
  LOCATION_REFRESH_THRESHOLD_KM;
