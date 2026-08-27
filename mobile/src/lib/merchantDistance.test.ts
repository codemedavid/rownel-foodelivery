import {
  calculateDistanceKm,
  decorateAndFilterMerchantsByDistance,
  hasMovedBeyondThreshold,
} from './merchantDistance';
import { Merchant } from '../types';

const baseMerchant = (overrides: Partial<Merchant>): Merchant =>
  ({
    id: 'm1',
    name: 'Test Merchant',
    category: 'restaurant',
    deliveryFee: 49,
    minimumOrder: 0,
    rating: 4.5,
    featured: false,
    latitude: null,
    longitude: null,
    maxDeliveryDistanceKm: 20,
    ...overrides,
  }) as Merchant;

// Naga City coordinates used as the reference point throughout.
const USER_LOCATION = { latitude: 13.6218, longitude: 123.1948 };

describe('calculateDistanceKm', () => {
  it('returns ~0 for identical points', () => {
    expect(
      calculateDistanceKm(USER_LOCATION.latitude, USER_LOCATION.longitude, USER_LOCATION.latitude, USER_LOCATION.longitude)
    ).toBeCloseTo(0, 5);
  });

  it('returns roughly the known Naga→Manila distance', () => {
    const km = calculateDistanceKm(13.6218, 123.1948, 14.5995, 120.9842);
    expect(km).toBeGreaterThan(250);
    expect(km).toBeLessThan(350);
  });
});

describe('decorateAndFilterMerchantsByDistance', () => {
  it('returns all merchants untouched when user location is unknown', () => {
    const merchants = [
      baseMerchant({ id: 'a', latitude: 13.62, longitude: 123.19 }),
      baseMerchant({ id: 'b', latitude: null, longitude: null }),
    ];

    const result = decorateAndFilterMerchantsByDistance(merchants, null);

    expect(result).toHaveLength(2);
    expect(result[0].distanceKm).toBeUndefined();
  });

  it('decorates merchants with distanceKm from the user location', () => {
    const merchants = [baseMerchant({ id: 'a', latitude: 13.6218, longitude: 123.1948 })];

    const result = decorateAndFilterMerchantsByDistance(merchants, USER_LOCATION);

    expect(result).toHaveLength(1);
    expect(result[0].distanceKm).toBeCloseTo(0, 2);
  });

  it('hides merchants beyond their own max delivery distance', () => {
    const merchants = [
      baseMerchant({ id: 'near', latitude: 13.6218, longitude: 123.1948, maxDeliveryDistanceKm: 20 }),
      // Manila, ~340 km away, radius 20 km → hidden
      baseMerchant({ id: 'far', latitude: 14.5995, longitude: 120.9842, maxDeliveryDistanceKm: 20 }),
    ];

    const result = decorateAndFilterMerchantsByDistance(merchants, USER_LOCATION);

    expect(result.map((m) => m.id)).toEqual(['near']);
  });

  it('keeps merchants with no max delivery distance regardless of distance', () => {
    const merchants = [
      baseMerchant({ id: 'far', latitude: 14.5995, longitude: 120.9842, maxDeliveryDistanceKm: null }),
    ];

    const result = decorateAndFilterMerchantsByDistance(merchants, USER_LOCATION);

    expect(result.map((m) => m.id)).toEqual(['far']);
    expect(result[0].distanceKm).toBeGreaterThan(100);
  });

  it('hides merchants with no coordinates once the user location is known', () => {
    const merchants = [baseMerchant({ id: 'no-coords', latitude: null, longitude: null })];

    const result = decorateAndFilterMerchantsByDistance(merchants, USER_LOCATION);

    expect(result).toHaveLength(0);
  });

  it('sorts nearest merchants first when a location is known', () => {
    const merchants = [
      baseMerchant({ id: 'farther', latitude: 13.7, longitude: 123.3, maxDeliveryDistanceKm: 50 }),
      baseMerchant({ id: 'nearest', latitude: 13.6218, longitude: 123.1948 }),
    ];

    const result = decorateAndFilterMerchantsByDistance(merchants, USER_LOCATION);

    expect(result.map((m) => m.id)).toEqual(['nearest', 'farther']);
  });

  it('does not mutate the input merchants', () => {
    const merchant = baseMerchant({ id: 'a', latitude: 13.62, longitude: 123.19 });

    decorateAndFilterMerchantsByDistance([merchant], USER_LOCATION);

    expect('distanceKm' in merchant).toBe(false);
  });
});

describe('hasMovedBeyondThreshold', () => {
  it('returns false for a fix within the refresh threshold', () => {
    expect(
      hasMovedBeyondThreshold(USER_LOCATION, {
        latitude: USER_LOCATION.latitude + 0.0005, // ~55 m north
        longitude: USER_LOCATION.longitude,
      })
    ).toBe(false);
  });

  it('returns true for a fix beyond the refresh threshold', () => {
    expect(
      hasMovedBeyondThreshold(USER_LOCATION, {
        latitude: USER_LOCATION.latitude + 0.01, // ~1.1 km north
        longitude: USER_LOCATION.longitude,
      })
    ).toBe(true);
  });

  it('treats a low-accuracy fix as not moved when the move is within the accuracy slack', () => {
    expect(
      hasMovedBeyondThreshold(
        USER_LOCATION,
        {
          latitude: USER_LOCATION.latitude + 0.01, // ~1.1 km north
          longitude: USER_LOCATION.longitude,
        },
        5 // ±5 km accuracy — the apparent move could be pure GPS noise
      )
    ).toBe(false);
  });
});
