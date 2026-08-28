import { calculateDistanceKm, Coordinates } from './merchantDistance';
import { DeliveryMode, Merchant } from '../types';

/** Fallback per-km rate when a merchant has none configured (mirrors the web app). */
const DEFAULT_FEE_PER_KM = 4;

export interface DeliveryQuote {
  deliverable: boolean;
  /** null when distance could not be computed (no user or merchant coordinates). */
  distanceKm: number | null;
  deliveryFee: number;
  /** true when the fee is the merchant flat rate rather than a distance-based quote. */
  isEstimate: boolean;
  reason?: string;
}

const roundToCurrency = (value: number): number => Number(value.toFixed(2));

const clampFee = (fee: number, merchant: Merchant): number => {
  let clamped = fee;
  if (typeof merchant.minDeliveryFee === 'number') {
    clamped = Math.max(clamped, merchant.minDeliveryFee);
  }
  if (typeof merchant.maxDeliveryFee === 'number') {
    clamped = Math.min(clamped, merchant.maxDeliveryFee);
  }
  return roundToCurrency(clamped);
};

const flatFeeQuote = (merchant: Merchant): DeliveryQuote => ({
  deliverable: true,
  distanceKm: null,
  deliveryFee: merchant.deliveryFee ?? 0,
  isEstimate: true,
});

/**
 * Distance-based delivery quote for one merchant, mirroring the web checkout
 * (src/components/Checkout.tsx). Without coordinates the mobile app has no
 * geocoded address yet, so it falls back to the merchant's flat fee rather
 * than showing a misleading zero.
 */
export const quoteMerchantDelivery = (
  merchant: Merchant,
  userLocation: Coordinates | null,
  mode: DeliveryMode = 'priority'
): DeliveryQuote => {
  const hasMerchantCoords =
    typeof merchant.latitude === 'number' && typeof merchant.longitude === 'number';

  if (!userLocation || !hasMerchantCoords) {
    return flatFeeQuote(merchant);
  }

  const distanceKm = calculateDistanceKm(
    merchant.latitude as number,
    merchant.longitude as number,
    userLocation.latitude,
    userLocation.longitude
  );

  const maxDistanceKm = merchant.maxDeliveryDistanceKm ?? null;

  if (maxDistanceKm !== null && distanceKm > maxDistanceKm) {
    return {
      deliverable: false,
      distanceKm,
      deliveryFee: 0,
      isEstimate: false,
      reason: `Outside delivery range (${maxDistanceKm} km max).`,
    };
  }

  const fixedFee = merchant.fixedDeliveryFee ?? 0;
  if (mode === 'economy' && fixedFee > 0) {
    return { deliverable: true, distanceKm, deliveryFee: fixedFee, isEstimate: false };
  }

  const base = merchant.baseDeliveryFee ?? merchant.deliveryFee ?? 0;
  const perKm = merchant.deliveryFeePerKm ?? DEFAULT_FEE_PER_KM;

  return {
    deliverable: true,
    distanceKm,
    deliveryFee: clampFee(base + distanceKm * perKm, merchant),
    isEstimate: false,
  };
};

export const quoteMerchants = (
  merchantIds: readonly string[],
  merchantsById: Record<string, Merchant>,
  userLocation: Coordinates | null,
  mode: DeliveryMode = 'priority'
): Record<string, DeliveryQuote> =>
  merchantIds.reduce<Record<string, DeliveryQuote>>((quotes, merchantId) => {
    const merchant = merchantsById[merchantId];
    const quote: DeliveryQuote = merchant
      ? quoteMerchantDelivery(merchant, userLocation, mode)
      : {
          deliverable: false,
          distanceKm: null,
          deliveryFee: 0,
          isEstimate: false,
          reason: 'Restaurant not found.',
        };
    return { ...quotes, [merchantId]: quote };
  }, {});

/**
 * The customer pays a single delivery fee for the whole basket — the furthest
 * (most expensive) merchant's. That merchant's order carries the fee; the rest
 * are charged zero.
 */
export const selectPrimaryMerchantId = (
  quotes: Record<string, DeliveryQuote>
): string | null => {
  let primaryId: string | null = null;
  let highestFee = -1;

  for (const [merchantId, quote] of Object.entries(quotes)) {
    if (quote.deliverable && quote.deliveryFee > highestFee) {
      highestFee = quote.deliveryFee;
      primaryId = merchantId;
    }
  }

  return primaryId;
};

export const getDeliveryFeeTotal = (quotes: Record<string, DeliveryQuote>): number => {
  const primaryId = selectPrimaryMerchantId(quotes);
  return primaryId ? quotes[primaryId].deliveryFee : 0;
};

export const getUndeliverableMerchantIds = (
  quotes: Record<string, DeliveryQuote>
): string[] =>
  Object.entries(quotes)
    .filter(([, quote]) => !quote.deliverable)
    .map(([merchantId]) => merchantId);
