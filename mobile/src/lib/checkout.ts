import { groupCartByMerchant } from './cart';
import { DeliveryQuote } from './deliveryQuotes';
import { CartItem, DeliveryMode, OrderData, PaymentMethod, ServiceType } from '../types';

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

export interface CreateOrderItemInput {
  itemId: string;
  name: string;
  variation: { id: string; name: string; price: number } | null;
  addOns: Array<{ id: string; name: string; price: number; quantity: number }> | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface CreateOrderInput {
  merchantId: string;
  customerName: string;
  contactNumber: string;
  serviceType: ServiceType;
  address: string | null;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  distanceKm: number | null;
  deliveryFee: number | null;
  deliveryFeeBreakdown: Record<string, unknown> | null;
  deliveryMode: DeliveryMode;
  pickupTime: string | null;
  partySize: number | null;
  dineInTime: string | null;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
  total: number;
  items: CreateOrderItemInput[];
}

/**
 * Payload for the create_order(p jsonb) RPC — the same server path the web app
 * uses (validates pricing, decrements inventory, triggers rider dispatch, and
 * stamps customer_user_id for signed-in customers).
 */
export const buildCreateOrderInput = (order: OrderData): CreateOrderInput => {
  const itemRows = buildOrderItemRows('pending', order.items);
  return {
    merchantId: order.merchantId,
    customerName: order.customerName.trim(),
    contactNumber: order.contactNumber.trim(),
    serviceType: order.serviceType,
    address: order.address ?? null,
    deliveryLatitude: order.deliveryLatitude ?? null,
    deliveryLongitude: order.deliveryLongitude ?? null,
    distanceKm: order.distanceKm ?? null,
    deliveryFee: order.deliveryFee ?? null,
    deliveryFeeBreakdown: order.deliveryFeeBreakdown ?? null,
    deliveryMode: order.deliveryMode ?? 'priority',
    pickupTime: order.pickupTime ?? null,
    partySize: order.partySize ?? null,
    dineInTime: order.dineInTime ? new Date(order.dineInTime).toISOString() : null,
    paymentMethod: order.paymentMethod ?? 'cash',
    referenceNumber: order.referenceNumber ?? null,
    notes: order.notes ?? null,
    total: order.total,
    items: itemRows.map((row) => ({
      itemId: row.item_id,
      name: row.name,
      variation: row.variation,
      addOns: row.add_ons,
      unitPrice: row.unit_price,
      quantity: row.quantity,
      subtotal: row.subtotal,
    })),
  };
};

export interface MerchantOrderFormInput {
  customerName: string;
  contactNumber: string;
  serviceType: ServiceType;
  address?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  paymentMethod: PaymentMethod;
  deliveryMode?: DeliveryMode;
  referenceNumber?: string;
  notes?: string;
}

export interface BuildMerchantOrderInputsArgs {
  cartItems: readonly CartItem[];
  quotes: Record<string, DeliveryQuote>;
  /** The merchant whose order carries the basket's single delivery fee. */
  primaryMerchantId: string | null;
  form: MerchantOrderFormInput;
}

/**
 * Splits a multi-restaurant basket into one create_order payload per merchant.
 * Mirrors the web checkout (src/components/Checkout.tsx): the customer pays a
 * single delivery fee — the furthest merchant's — so only that merchant's order
 * carries a fee and every other order is charged zero.
 */
export const buildMerchantOrderInputs = ({
  cartItems,
  quotes,
  primaryMerchantId,
  form,
}: BuildMerchantOrderInputsArgs): CreateOrderInput[] => {
  const isDelivery = form.serviceType === 'delivery';

  return Object.entries(groupCartByMerchant(cartItems)).map(([merchantId, items]) => {
    const quote = quotes[merchantId];
    const subtotal = items.reduce((sum, line) => sum + line.totalPrice * line.quantity, 0);
    const deliveryFee =
      isDelivery && merchantId === primaryMerchantId ? quote?.deliveryFee ?? 0 : 0;

    return buildCreateOrderInput({
      merchantId,
      items,
      customerName: form.customerName,
      contactNumber: form.contactNumber,
      serviceType: form.serviceType,
      address: isDelivery ? form.address : undefined,
      deliveryLatitude: isDelivery ? form.deliveryLatitude : undefined,
      deliveryLongitude: isDelivery ? form.deliveryLongitude : undefined,
      distanceKm: isDelivery ? quote?.distanceKm ?? undefined : undefined,
      deliveryFee: isDelivery ? deliveryFee : undefined,
      deliveryMode: form.deliveryMode ?? 'priority',
      paymentMethod: form.paymentMethod,
      referenceNumber: form.referenceNumber,
      notes: form.notes,
      total: subtotal + deliveryFee,
    });
  });
};
