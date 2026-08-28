import {
  quoteMerchantDelivery,
  quoteMerchants,
  selectPrimaryMerchantId,
  getDeliveryFeeTotal,
} from './deliveryQuotes';
import { Merchant } from '../types';

const baseMerchant: Merchant = {
  id: 'm-1',
  name: 'Burger Place',
  category: 'burgers',
  deliveryFee: 50,
  minimumOrder: 100,
  rating: 4.5,
  totalReviews: 10,
  active: true,
  featured: false,
  baseDeliveryFee: 20,
  deliveryFeePerKm: 10,
  latitude: 14.5995,
  longitude: 120.9842,
};

// ~2.2 km north of the merchant.
const nearby = { latitude: 14.6195, longitude: 120.9842 };

describe('quoteMerchantDelivery', () => {
  it('quotes a distance-based fee when both coordinates are known', () => {
    const quote = quoteMerchantDelivery(baseMerchant, nearby);

    expect(quote.deliverable).toBe(true);
    expect(quote.distanceKm).toBeCloseTo(2.22, 1);
    // 20 base + 10/km * ~2.22 km
    expect(quote.deliveryFee).toBeCloseTo(42.2, 1);
  });

  it('falls back to the merchant flat delivery fee when the user location is unknown', () => {
    const quote = quoteMerchantDelivery(baseMerchant, null);

    expect(quote.deliverable).toBe(true);
    expect(quote.deliveryFee).toBe(50);
    expect(quote.distanceKm).toBeNull();
    expect(quote.isEstimate).toBe(true);
  });

  it('falls back to the flat fee when the merchant has no coordinates', () => {
    const quote = quoteMerchantDelivery(
      { ...baseMerchant, latitude: null, longitude: null },
      nearby
    );

    expect(quote.deliveryFee).toBe(50);
    expect(quote.isEstimate).toBe(true);
  });

  it('marks the merchant undeliverable beyond its maximum delivery distance', () => {
    const quote = quoteMerchantDelivery(
      { ...baseMerchant, maxDeliveryDistanceKm: 1 },
      nearby
    );

    expect(quote.deliverable).toBe(false);
    expect(quote.reason).toContain('1 km');
    expect(quote.deliveryFee).toBe(0);
  });

  it('clamps the fee to the merchant minimum and maximum', () => {
    const clamped = quoteMerchantDelivery(
      { ...baseMerchant, minDeliveryFee: 60, maxDeliveryFee: 80 },
      nearby
    );

    expect(clamped.deliveryFee).toBe(60);
  });

  it('uses the fixed delivery fee in economy mode when one is configured', () => {
    const quote = quoteMerchantDelivery(
      { ...baseMerchant, fixedDeliveryFee: 39 },
      nearby,
      'economy'
    );

    expect(quote.deliveryFee).toBe(39);
  });
});

describe('quoteMerchants', () => {
  it('quotes each merchant id in the basket', () => {
    const far: Merchant = { ...baseMerchant, id: 'm-2', latitude: 14.7, longitude: 121.1 };

    const quotes = quoteMerchants(['m-1', 'm-2'], { 'm-1': baseMerchant, 'm-2': far }, nearby);

    expect(Object.keys(quotes)).toEqual(['m-1', 'm-2']);
    expect(quotes['m-2'].deliveryFee).toBeGreaterThan(quotes['m-1'].deliveryFee);
  });

  it('marks an unknown merchant as undeliverable instead of throwing', () => {
    const quotes = quoteMerchants(['m-missing'], {}, nearby);

    expect(quotes['m-missing'].deliverable).toBe(false);
    expect(quotes['m-missing'].reason).toBe('Restaurant not found.');
  });
});

describe('selectPrimaryMerchantId / getDeliveryFeeTotal', () => {
  it('picks the merchant with the highest deliverable fee', () => {
    const quotes = {
      'm-1': { deliverable: true, distanceKm: 1, deliveryFee: 30, isEstimate: false },
      'm-2': { deliverable: true, distanceKm: 6, deliveryFee: 80, isEstimate: false },
    };

    expect(selectPrimaryMerchantId(quotes)).toBe('m-2');
    expect(getDeliveryFeeTotal(quotes)).toBe(80);
  });

  it('ignores undeliverable merchants when choosing the primary', () => {
    const quotes = {
      'm-1': { deliverable: true, distanceKm: 1, deliveryFee: 30, isEstimate: false },
      'm-2': {
        deliverable: false,
        distanceKm: 20,
        deliveryFee: 0,
        isEstimate: false,
        reason: 'Too far.',
      },
    };

    expect(selectPrimaryMerchantId(quotes)).toBe('m-1');
    expect(getDeliveryFeeTotal(quotes)).toBe(30);
  });

  it('returns no primary merchant and a zero fee for an empty basket', () => {
    expect(selectPrimaryMerchantId({})).toBeNull();
    expect(getDeliveryFeeTotal({})).toBe(0);
  });
});
