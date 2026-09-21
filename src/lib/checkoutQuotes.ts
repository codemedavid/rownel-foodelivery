import type { Merchant } from '../types';
import { calculateDeliveryFee, haversineKm } from './deliveryPricing';

export type DeliveryMode = 'priority' | 'economy';

export interface DropoffPoint {
  latitude: number;
  longitude: number;
}

export interface DeliveryQuote {
  deliverable: boolean;
  reason?: string;
  distanceKm?: number;
  deliveryFee?: number;
}

const DEFAULT_FEE_PER_KM = 4;

const distanceFee = (merchant: Merchant, distanceKm: number): number =>
  calculateDeliveryFee(distanceKm, {
    baseDeliveryFee: merchant.baseDeliveryFee ?? merchant.deliveryFee ?? 0,
    deliveryFeePerKm: merchant.deliveryFeePerKm ?? DEFAULT_FEE_PER_KM,
    minDeliveryFee: merchant.minDeliveryFee,
    maxDeliveryFee: merchant.maxDeliveryFee,
  });

const maxDistanceFor = (merchant: Merchant, mode: DeliveryMode): number | null =>
  mode === 'economy'
    ? merchant.pasabuyMaxDistanceKm ?? merchant.maxDeliveryDistanceKm ?? null
    : merchant.maxDeliveryDistanceKm ?? null;

/** Fee and reachability for one merchant delivering to `dropoff` under `mode`. */
export const quoteMerchantDelivery = (
  merchant: Merchant | undefined,
  dropoff: DropoffPoint | null,
  mode: DeliveryMode
): DeliveryQuote => {
  if (!merchant) return { deliverable: false, reason: 'Store not found.' };
  if (!dropoff) return { deliverable: false, reason: 'Set your delivery address to see the fee.' };
  if (merchant.latitude == null || merchant.longitude == null) {
    return { deliverable: false, reason: 'This store has not set its delivery location yet.' };
  }

  const distanceKm = haversineKm(merchant.latitude, merchant.longitude, dropoff.latitude, dropoff.longitude);
  const maxDistanceKm = maxDistanceFor(merchant, mode);
  if (maxDistanceKm !== null && distanceKm > maxDistanceKm) {
    return {
      deliverable: false,
      distanceKm,
      reason: `Your address is outside this store's ${mode === 'economy' ? 'Pasabay' : 'delivery'} area (${maxDistanceKm} km max).`,
    };
  }

  const useFixedFee = mode === 'economy' && (merchant.fixedDeliveryFee ?? 0) > 0;
  const deliveryFee = useFixedFee ? (merchant.fixedDeliveryFee as number) : distanceFee(merchant, distanceKm);
  return { deliverable: true, distanceKm, deliveryFee };
};

export type QuotesByMerchant = Record<string, DeliveryQuote>;

export const quoteAllMerchants = (
  merchants: readonly Merchant[],
  merchantIds: readonly string[],
  dropoff: DropoffPoint | null,
  mode: DeliveryMode
): QuotesByMerchant =>
  Object.fromEntries(
    merchantIds.map((id) => [id, quoteMerchantDelivery(merchants.find((m) => m.id === id), dropoff, mode)])
  );

/**
 * Multi-store baskets pay a single delivery fee: the highest quote (the
 * furthest store). Returns that store's id, or null when nothing is deliverable.
 */
export const pickPrimaryDeliveryMerchant = (quotes: QuotesByMerchant): string | null => {
  let bestId: string | null = null;
  let bestFee = -1;
  for (const [id, quote] of Object.entries(quotes)) {
    if (quote.deliverable && (quote.deliveryFee ?? 0) > bestFee) {
      bestFee = quote.deliveryFee ?? 0;
      bestId = id;
    }
  }
  return bestId;
};

/** The fee the customer pays for a given mode — max over deliverable stores. */
export const totalFeeForMode = (
  merchants: readonly Merchant[],
  merchantIds: readonly string[],
  dropoff: DropoffPoint | null,
  mode: DeliveryMode
): number => {
  const quotes = quoteAllMerchants(merchants, merchantIds, dropoff, mode);
  const primary = pickPrimaryDeliveryMerchant(quotes);
  return primary ? quotes[primary].deliveryFee ?? 0 : 0;
};

/** Pasabay is offered when any store in the basket has a fixed fee. */
export const basketSupportsEconomy = (merchants: readonly Merchant[], merchantIds: readonly string[]): boolean =>
  merchantIds.some((id) => ((merchants.find((m) => m.id === id)?.fixedDeliveryFee ?? 0) > 0));
