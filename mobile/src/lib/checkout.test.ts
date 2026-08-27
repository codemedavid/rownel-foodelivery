import {
  validateCheckoutForm,
  resolveDeliveryMode,
  buildOrderInsert,
  buildOrderItemRows,
} from './checkout';
import { CartItem, OrderData } from '../types';

const line: CartItem = {
  id: 'i-1',
  lineId: 'i-1::sig',
  menuItemId: 'i-1',
  merchantId: 'm-1',
  name: 'Sisig',
  description: 'Sizzling',
  basePrice: 180,
  category: 'mains',
  quantity: 2,
  totalPrice: 220,
  selectedVariations: { Size: { id: 'v2', name: 'Large', price: 40 } },
  selectedAddOns: [{ id: 'a1', name: 'Egg', price: 15, category: 'extras', quantity: 1 }],
};

const baseOrder: OrderData = {
  merchantId: 'm-1',
  items: [line],
  customerName: 'Juan Dela Cruz',
  contactNumber: '09171234567',
  serviceType: 'delivery',
  address: '123 Rizal St, Poblacion',
  deliveryFee: 49,
  paymentMethod: 'gcash',
  total: 489,
};

describe('validateCheckoutForm', () => {
  it('accepts a valid delivery form', () => {
    const result = validateCheckoutForm({
      customerName: 'Juan Dela Cruz',
      contactNumber: '09171234567',
      serviceType: 'delivery',
      address: '123 Rizal St',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('rejects an empty or too-short name', () => {
    const result = validateCheckoutForm({
      customerName: '  ',
      contactNumber: '09171234567',
      serviceType: 'pickup',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.customerName).toBeTruthy();
  });

  it('rejects malformed phone numbers', () => {
    const result = validateCheckoutForm({
      customerName: 'Juan',
      contactNumber: '12345',
      serviceType: 'pickup',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.contactNumber).toBeTruthy();
  });

  it('accepts +639 international format with separators', () => {
    const result = validateCheckoutForm({
      customerName: 'Juan',
      contactNumber: '+63 917 123 4567',
      serviceType: 'pickup',
    });

    expect(result.valid).toBe(true);
  });

  it('requires an address only for delivery orders', () => {
    const delivery = validateCheckoutForm({
      customerName: 'Juan',
      contactNumber: '09171234567',
      serviceType: 'delivery',
      address: '',
    });
    const pickup = validateCheckoutForm({
      customerName: 'Juan',
      contactNumber: '09171234567',
      serviceType: 'pickup',
      address: '',
    });

    expect(delivery.valid).toBe(false);
    expect(delivery.errors.address).toBeTruthy();
    expect(pickup.valid).toBe(true);
  });
});

describe('resolveDeliveryMode', () => {
  it('keeps the selected mode when economy is offered', () => {
    expect(resolveDeliveryMode(true, 'economy')).toBe('economy');
  });

  it('forces priority when economy is not offered', () => {
    expect(resolveDeliveryMode(false, 'economy')).toBe('priority');
  });
});

describe('buildOrderInsert', () => {
  it('maps the order to the snake_case insert row', () => {
    const row = buildOrderInsert(baseOrder);

    expect(row.merchant_id).toBe('m-1');
    expect(row.customer_name).toBe('Juan Dela Cruz');
    expect(row.contact_number).toBe('09171234567');
    expect(row.service_type).toBe('delivery');
    expect(row.address).toBe('123 Rizal St, Poblacion');
    expect(row.delivery_fee).toBe(49);
    expect(row.payment_method).toBe('gcash');
    expect(row.total).toBe(489);
  });

  it('never emits undefined — optional fields become null', () => {
    const row = buildOrderInsert({ ...baseOrder, serviceType: 'pickup', address: undefined, deliveryFee: undefined });

    expect(row.address).toBeNull();
    expect(row.delivery_fee).toBeNull();
    expect(row.reference_number).toBeNull();
    expect(Object.values(row)).not.toContain(undefined);
  });

  it('always sends a concrete delivery_mode for delivery orders (NOT-NULL column)', () => {
    const row = buildOrderInsert({ ...baseOrder, deliveryMode: undefined });
    expect(row.delivery_mode).toBe('priority');
  });
});

describe('buildOrderItemRows', () => {
  it('maps cart lines to order_items rows with subtotals', () => {
    const rows = buildOrderItemRows('order-1', [line]);

    expect(rows).toHaveLength(1);
    expect(rows[0].order_id).toBe('order-1');
    expect(rows[0].item_id).toBe('i-1');
    expect(rows[0].unit_price).toBe(220);
    expect(rows[0].quantity).toBe(2);
    expect(rows[0].subtotal).toBe(440);
    expect(rows[0].add_ons).toEqual([{ id: 'a1', name: 'Egg', price: 15, quantity: 1 }]);
  });

  it('serializes selected variation groups into the variation column', () => {
    const rows = buildOrderItemRows('order-1', [line]);
    expect(rows[0].variation).toEqual({ id: 'v2', name: 'Large', price: 40 });
  });

  it('stores null for lines without add-ons or variations', () => {
    const bare: CartItem = { ...line, selectedAddOns: undefined, selectedVariations: undefined };
    const rows = buildOrderItemRows('order-1', [bare]);

    expect(rows[0].add_ons).toBeNull();
    expect(rows[0].variation).toBeNull();
  });
});

describe('buildCreateOrderInput', () => {
  it('builds the create_order RPC payload with camelCase keys and item subtotals', () => {
    const input = buildCreateOrderInput(baseOrder);

    expect(input.merchantId).toBe('m-1');
    expect(input.customerName).toBe('Juan Dela Cruz');
    expect(input.serviceType).toBe('delivery');
    expect(input.deliveryFee).toBe(49);
    expect(input.deliveryMode).toBe('priority');
    expect(input.total).toBe(489);
    expect(input.items).toHaveLength(1);
    expect(input.items[0]).toMatchObject({
      itemId: 'i-1',
      name: 'Sisig',
      unitPrice: 220,
      quantity: 2,
      subtotal: 440,
    });
  });

  it('keeps total consistent with item subtotals plus delivery fee (server validates this)', () => {
    const input = buildCreateOrderInput(baseOrder);
    const itemsTotal = input.items.reduce((sum, i) => sum + i.subtotal, 0);
    expect(itemsTotal + (input.deliveryFee ?? 0)).toBe(input.total);
  });

  it('omits delivery-only fields for pickup orders without sending undefined', () => {
    const input = buildCreateOrderInput({
      ...baseOrder,
      serviceType: 'pickup',
      address: undefined,
      deliveryFee: undefined,
    });
    expect(input.address).toBeNull();
    expect(input.deliveryFee).toBeNull();
    expect(Object.values(input)).not.toContain(undefined);
  });
});
