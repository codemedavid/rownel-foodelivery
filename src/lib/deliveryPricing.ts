export interface DeliveryPricingConfig {
  baseDeliveryFee: number;
  deliveryFeePerKm: number;
  minDeliveryFee?: number | null;
  maxDeliveryFee?: number | null;
}

export const roundToCurrency = (value: number): number => {
  return Number(value.toFixed(2));
};

export const calculateDeliveryFee = (
  distanceKm: number,
  config: DeliveryPricingConfig
): number => {
  const raw = config.baseDeliveryFee + distanceKm * config.deliveryFeePerKm;

  let fee = raw;
  if (typeof config.minDeliveryFee === 'number') {
    fee = Math.max(fee, config.minDeliveryFee);
  }
  if (typeof config.maxDeliveryFee === 'number') {
    fee = Math.min(fee, config.maxDeliveryFee);
  }

  return roundToCurrency(fee);
};

export const toRadians = (degrees: number): number => degrees * (Math.PI / 180);

export const haversineKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusKm * c).toFixed(3));
};
