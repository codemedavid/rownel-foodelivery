import { describe, expect, it } from 'vitest';
import type { Merchant } from '../types';
import { basketSupportsEconomy, pickPrimaryDeliveryMerchant, quoteAllMerchants, quoteMerchantDelivery, totalFeeForMode } from './checkoutQuotes';

const baseMerchant: Merchant = {
  id: 'm1',
  name: 'Store',
  category: 'restaurant',
  deliveryFee: 0,
  minimumOrder: 0,
  rating: 0,
  totalReviews: 0,
  active: true,
  featured: false,
  latitude: 14.5995,
  longitude: 120.9842,
  baseDeliveryFee: 30,
  deliveryFeePerKm: 10,
  minDeliveryFee: null,
  maxDeliveryFee: null,
  maxDeliveryDistanceKm: 5,
  fixedDeliveryFee: 25,
  pasabuyMaxDistanceKm: 10,
  createdAt: '',
  updatedAt: '',
};

// ~2.2 km north of the merchant
const nearby = { latitude: 14.6195, longitude: 120.9842 };
// ~8.9 km north of the merchant
const far = { latitude: 14.6795, longitude: 120.9842 };

describe('quoteMerchantDelivery', () => {
  it('explains what is missing when the address or merchant location is absent', () => {
    expect(quoteMerchantDelivery(undefined, nearby, 'priority').deliverable).toBe(false);
    expect(quoteMerchantDelivery(baseMerchant, null, 'priority').reason).toMatch(/address/i);
    expect(quoteMerchantDelivery({ ...baseMerchant, latitude: null }, nearby, 'priority').reason).toMatch(/location/i);
  });

  it('charges base + per-km for rush delivery', () => {
    const quote = quoteMerchantDelivery(baseMerchant, nearby, 'priority');
    expect(quote.deliverable).toBe(true);
    expect(quote.distanceKm).toBeCloseTo(2.22, 1);
    expect(quote.deliveryFee).toBeGreaterThan(30);
  });

  it('charges the fixed fee for Pasabay when the store sets one', () => {
    expect(quoteMerchantDelivery(baseMerchant, nearby, 'economy').deliveryFee).toBe(25);
  });

  it('uses the wider Pasabay radius', () => {
    expect(quoteMerchantDelivery(baseMerchant, far, 'priority').deliverable).toBe(false);
    expect(quoteMerchantDelivery(baseMerchant, far, 'economy').deliverable).toBe(true);
  });
});

describe('multi-store baskets', () => {
  const second: Merchant = { ...baseMerchant, id: 'm2', latitude: 14.5995, longitude: 121.0142, fixedDeliveryFee: 0 };

  it('charges a single fee from the furthest deliverable store', () => {
    const quotes = quoteAllMerchants([baseMerchant, second], ['m1', 'm2'], nearby, 'priority');
    const primary = pickPrimaryDeliveryMerchant(quotes);
    expect(primary).toBe('m2');
    expect(totalFeeForMode([baseMerchant, second], ['m1', 'm2'], nearby, 'priority')).toBe(quotes.m2.deliveryFee);
  });

  it('returns null when nothing is deliverable', () => {
    expect(pickPrimaryDeliveryMerchant({ m1: { deliverable: false } })).toBeNull();
  });

  it('offers Pasabay when any store has a fixed fee', () => {
    expect(basketSupportsEconomy([baseMerchant, second], ['m1', 'm2'])).toBe(true);
    expect(basketSupportsEconomy([second], ['m2'])).toBe(false);
  });
});
