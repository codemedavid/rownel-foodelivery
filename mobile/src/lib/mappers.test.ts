import { mapMerchantRow, mapMenuItemRow } from './mappers';

const merchantRow = {
  id: 'm-1',
  name: 'Tita Baby Eatery',
  description: 'Home-cooked meals',
  logo_url: 'https://ik.imagekit.io/x/logo.png',
  cover_image_url: 'https://ik.imagekit.io/x/cover.png',
  category: 'restaurant',
  cuisine_type: 'Filipino',
  delivery_fee: 49,
  minimum_order: 150,
  estimated_delivery_time: '30-45 min',
  rating: 4.7,
  total_reviews: 132,
  active: true,
  featured: true,
  address: 'Poblacion',
  contact_number: '09171234567',
  opening_hours: { monday: '09:00-22:00' },
  payment_methods: ['gcash'],
  base_delivery_fee: 39,
  delivery_fee_per_km: 10,
  min_delivery_fee: 39,
  max_delivery_fee: 120,
  max_delivery_distance_km: 8,
  fixed_delivery_fee: 0,
  latitude: 14.6,
  longitude: 121.0,
};

describe('mapMerchantRow', () => {
  it('maps snake_case columns to the camelCase Merchant model', () => {
    const merchant = mapMerchantRow(merchantRow);

    expect(merchant.id).toBe('m-1');
    expect(merchant.logoUrl).toBe('https://ik.imagekit.io/x/logo.png');
    expect(merchant.coverImageUrl).toBe('https://ik.imagekit.io/x/cover.png');
    expect(merchant.cuisineType).toBe('Filipino');
    expect(merchant.deliveryFee).toBe(49);
    expect(merchant.minimumOrder).toBe(150);
    expect(merchant.estimatedDeliveryTime).toBe('30-45 min');
    expect(merchant.baseDeliveryFee).toBe(39);
    expect(merchant.maxDeliveryDistanceKm).toBe(8);
  });
});

const itemRow = {
  id: 'i-1',
  merchant_id: 'm-1',
  name: 'Sisig',
  description: 'Sizzling',
  base_price: 180,
  category: 'mains',
  image_url: 'https://ik.imagekit.io/x/sisig.png',
  popular: true,
  available: true,
  discount_price: 150,
  discount_start_date: '2026-08-01T00:00:00Z',
  discount_end_date: '2026-08-31T00:00:00Z',
  discount_active: true,
  track_inventory: false,
  stock_quantity: null,
  low_stock_threshold: null,
  variations: [{ id: 'v1', name: 'Solo', price: 0 }],
  variation_groups: [
    {
      id: 'g1',
      name: 'Size',
      required: true,
      sort_order: 1,
      variations: [
        { id: 'v2', name: 'Large', price: 40, sort_order: 2 },
        { id: 'v1', name: 'Solo', price: 0, sort_order: 1 },
      ],
    },
  ],
  add_ons: [{ id: 'a1', name: 'Egg', price: 15, category: 'extras' }],
};

describe('mapMenuItemRow', () => {
  const during = new Date('2026-08-15T12:00:00Z');
  const after = new Date('2026-09-15T12:00:00Z');

  it('computes effectivePrice from an active discount window', () => {
    const item = mapMenuItemRow(itemRow, during);

    expect(item.effectivePrice).toBe(150);
    expect(item.isOnDiscount).toBe(true);
  });

  it('falls back to base price outside the discount window', () => {
    const item = mapMenuItemRow(itemRow, after);

    expect(item.effectivePrice).toBe(180);
    expect(item.isOnDiscount).toBe(false);
  });

  it('maps nested variation groups sorted by sort order', () => {
    const item = mapMenuItemRow(itemRow, during);

    expect(item.variationGroups).toHaveLength(1);
    expect(item.variationGroups?.[0].name).toBe('Size');
    expect(item.variationGroups?.[0].required).toBe(true);
    expect(item.variationGroups?.[0].variations.map((v) => v.name)).toEqual(['Solo', 'Large']);
  });

  it('assembles groups from flat variations linked by variation_group name (DB shape)', () => {
    const dbShapeRow = {
      ...itemRow,
      variations: [
        { id: 'v1', name: 'Solo', price: 0, variation_group: 'Size', sort_order: 1 },
        { id: 'v2', name: 'Large', price: 40, variation_group: 'Size', sort_order: 2 },
      ],
      variation_groups: [{ id: 'g1', name: 'Size', required: true, sort_order: 1 }],
    };

    const item = mapMenuItemRow(dbShapeRow, during);

    expect(item.variationGroups?.[0].variations.map((v) => v.name)).toEqual(['Solo', 'Large']);
    expect(item.variationGroups?.[0].variations[1].price).toBe(40);
  });

  it('defaults availability to true when the column is null', () => {
    const item = mapMenuItemRow({ ...itemRow, available: null }, during);
    expect(item.available).toBe(true);
  });

  it('marks tracked items with available=false as auto-disabled', () => {
    const item = mapMenuItemRow({ ...itemRow, track_inventory: true, available: false }, during);
    expect(item.autoDisabled).toBe(true);
    expect(item.available).toBe(false);
  });
});
