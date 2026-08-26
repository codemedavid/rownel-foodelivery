import { CartItem, DeliveryMode, OrderData, ServiceType } from '../types';

export interface CheckoutFormInput {
  customerName: string;
  contactNumber: string;
  serviceType: ServiceType;
  address?: string;
}

export interface CheckoutValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof CheckoutFormInput, string>>;
}

const MIN_NAME_LENGTH = 2;
// PH mobile numbers: 09XXXXXXXXX or +639XXXXXXXXX (separators allowed).
const PH_MOBILE_PATTERN = /^(09\d{9}|\+639\d{9})$/;

export const validateCheckoutForm = (input: CheckoutFormInput): CheckoutValidationResult => {
  const errors: CheckoutValidationResult['errors'] = {};

  const name = input.customerName.trim();
  if (name.length < MIN_NAME_LENGTH) {
    errors.customerName = 'Please enter your full name';
  }

  const phone = input.contactNumber.replace(/[\s\-()]/g, '');
  if (!PH_MOBILE_PATTERN.test(phone)) {
    errors.contactNumber = 'Enter a valid PH mobile number (09XXXXXXXXX)';
  }

  if (input.serviceType === 'delivery' && !input.address?.trim()) {
    errors.address = 'Delivery address is required';
  }

  return { valid: Object.keys(errors).length === 0, errors };
};

/**
 * orders.delivery_mode is NOT NULL — always send a concrete mode.
 * Mirrors src/lib/deliveryMode.ts in the web app.
 */
export const resolveDeliveryMode = (
  hasEconomyOption: boolean,
  selectedMode: DeliveryMode
): DeliveryMode => (hasEconomyOption ? selectedMode : 'priority');

export interface OrderInsertRow {
  merchant_id: string;
  customer_name: string;
  contact_number: string;
  service_type: ServiceType;
  address: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  distance_km: number | null;
  delivery_fee: number | null;
  delivery_fee_breakdown: Record<string, unknown> | null;
  delivery_mode: DeliveryMode;
  pickup_time: string | null;
  party_size: number | null;
  dine_in_time: string | null;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  total: number;
}

export const buildOrderInsert = (order: OrderData): OrderInsertRow => ({
  merchant_id: order.merchantId,
  customer_name: order.customerName.trim(),
  contact_number: order.contactNumber.trim(),
  service_type: order.serviceType,
  address: order.address ?? null,
  delivery_latitude: order.deliveryLatitude ?? null,
  delivery_longitude: order.deliveryLongitude ?? null,
  distance_km: order.distanceKm ?? null,
  delivery_fee: order.deliveryFee ?? null,
  delivery_fee_breakdown: order.deliveryFeeBreakdown ?? null,
  delivery_mode: order.deliveryMode ?? 'priority',
  pickup_time: order.pickupTime ?? null,
  party_size: order.partySize ?? null,
  dine_in_time: order.dineInTime ? new Date(order.dineInTime).toISOString() : null,
  payment_method: order.paymentMethod ?? 'cash',
  reference_number: order.referenceNumber ?? null,
  notes: order.notes ?? null,
  total: order.total,
});

export interface OrderItemRow {
  order_id: string;
  item_id: string;
  name: string;
  variation: { id: string; name: string; price: number } | null;
  add_ons: Array<{ id: string; name: string; price: number; quantity: number }> | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export const buildOrderItemRows = (
  orderId: string,
  items: readonly CartItem[]
): OrderItemRow[] =>
  items.map((line) => {
    // The order_items.variation column stores a single variation object; when
    // grouped variations are selected we persist the first (price-bearing) one,
    // matching how the web app records legacy single-variation selections.
    const variations = line.selectedVariations ? Object.values(line.selectedVariations) : [];
    const primaryVariation = variations.length > 0 ? variations[0] : null;

    return {
      order_id: orderId,
      item_id: line.menuItemId || line.id,
      name: line.name,
      variation: primaryVariation
        ? { id: primaryVariation.id, name: primaryVariation.name, price: primaryVariation.price }
        : null,
      add_ons:
        line.selectedAddOns && line.selectedAddOns.length > 0
          ? line.selectedAddOns.map((a) => ({
              id: a.id,
              name: a.name,
              price: a.price,
              quantity: a.quantity ?? 1,
            }))
          : null,
      unit_price: line.totalPrice,
      quantity: line.quantity,
      subtotal: line.totalPrice * line.quantity,
    };
  });
