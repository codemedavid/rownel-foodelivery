import { describe, expect, it } from 'vitest';
import { decorateAndFilterMerchantsByDistance, hasMovedBeyondThreshold } from './merchantDistance';
import { Merchant } from '../types';

const baseMerchant = (overrides: Partial<Merchant>): Merchant =>
  ({
    id: 'm1',
    name: 'Test Merchant',
    description: '',
    category: 'restaurant',
    active: true,
    featured: false,
    rating: 4.5,
    latitude: null,
    longitude: null,
    maxDeliveryDistanceKm: 20,
    ...overrides,
  }) as Merchant;

// Naga City coordinates used as the reference point throughout.
const USER_LOCATION = { latitude: 13.6218, longitude: 123.1948 };

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
      // ~0 km away, radius 20 km → visible
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

  it('does not mutate the input merchants', () => {
    const merchant = baseMerchant({ id: 'a', latitude: 13.62, longitude: 123.19 });
    const merchants = [merchant];

    decorateAndFilterMerchantsByDistance(merchants, USER_LOCATION);

    expect('distanceKm' in merchant).toBe(false);
  });
});

describe('hasMovedBeyondThreshold', () => {
  it('returns false for a fix within the refresh threshold', () => {
    const moved = hasMovedBeyondThreshold(USER_LOCATION, {
      latitude: USER_LOCATION.latitude + 0.0005, // ~55 m north
      longitude: USER_LOCATION.longitude,
    });

    expect(moved).toBe(false);
  });

  it('returns true for a fix beyond the refresh threshold', () => {
    const moved = hasMovedBeyondThreshold(USER_LOCATION, {
      latitude: USER_LOCATION.latitude + 0.01, // ~1.1 km north
      longitude: USER_LOCATION.longitude,
    });

    expect(moved).toBe(true);
  });

  it('treats a low-accuracy fix as not moved when the move is within the accuracy slack', () => {
    const moved = hasMovedBeyondThreshold(
      USER_LOCATION,
      {
        latitude: USER_LOCATION.latitude + 0.01, // ~1.1 km north
        longitude: USER_LOCATION.longitude,
      },
      5 // GPS accuracy of ±5 km — the apparent move could be pure noise
    );

    expect(moved).toBe(false);
  });
});
