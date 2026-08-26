import { AddOn, MenuItem, Merchant, Variation, VariationGroup } from '../types';

// Row shapes come from Supabase; validate the fields we rely on and map the rest.
type Row = Record<string, any>;

export const mapMerchantRow = (row: Row): Merchant => ({
  id: row.id,
  name: row.name,
  description: row.description ?? undefined,
  logoUrl: row.logo_url ?? undefined,
  coverImageUrl: row.cover_image_url ?? undefined,
  category: row.category,
  cuisineType: row.cuisine_type ?? undefined,
  deliveryFee: row.delivery_fee ?? 0,
  minimumOrder: row.minimum_order ?? 0,
  estimatedDeliveryTime: row.estimated_delivery_time ?? undefined,
  rating: row.rating ?? 0,
  totalReviews: row.total_reviews ?? 0,
  active: row.active ?? true,
  featured: row.featured ?? false,
  address: row.address ?? undefined,
  contactNumber: row.contact_number ?? undefined,
  openingHours: row.opening_hours ?? undefined,
  paymentMethods: row.payment_methods ?? undefined,
  baseDeliveryFee: row.base_delivery_fee ?? undefined,
  deliveryFeePerKm: row.delivery_fee_per_km ?? undefined,
  minDeliveryFee: row.min_delivery_fee ?? null,
  maxDeliveryFee: row.max_delivery_fee ?? null,
  maxDeliveryDistanceKm: row.max_delivery_distance_km ?? null,
  fixedDeliveryFee: row.fixed_delivery_fee ?? undefined,
  latitude: row.latitude ?? null,
  longitude: row.longitude ?? null,
});

const mapVariation = (v: Row): Variation => ({
  id: v.id,
  name: v.name,
  price: v.price ?? 0,
  variationGroup: v.variation_group ?? undefined,
  sortOrder: v.sort_order ?? 0,
});

// Groups may arrive with nested variations, or (DB shape) as bare rows whose
// members live in the item's flat variations list linked by variation_group name.
const mapVariationGroup = (g: Row, flatVariations: Row[]): VariationGroup => {
  const members =
    g.variations ?? flatVariations.filter((v) => (v.variation_group ?? 'default') === g.name);
  return {
    id: g.id,
    name: g.name,
    required: g.required ?? false,
    sortOrder: g.sort_order ?? 0,
    variations: members
      .map(mapVariation)
      .sort((a: Variation, b: Variation) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  };
};

const mapAddOn = (a: Row): AddOn => ({
  id: a.id,
  name: a.name,
  price: a.price ?? 0,
  category: a.category ?? 'extras',
});

export const mapMenuItemRow = (row: Row, now: Date = new Date()): MenuItem => {
  const discountStart = row.discount_start_date ? new Date(row.discount_start_date) : null;
  const discountEnd = row.discount_end_date ? new Date(row.discount_end_date) : null;

  const isDiscountActive = Boolean(
    row.discount_active &&
      (!discountStart || now >= discountStart) &&
      (!discountEnd || now <= discountEnd)
  );

  const effectivePrice =
    isDiscountActive && row.discount_price ? row.discount_price : row.base_price;

  return {
    id: row.id,
    merchantId: row.merchant_id,
    name: row.name,
    description: row.description ?? '',
    basePrice: row.base_price,
    category: row.category,
    image: row.image_url ?? undefined,
    popular: row.popular ?? false,
    available: row.available ?? true,
    variations: row.variations?.map(mapVariation),
    variationGroups: row.variation_groups
      ?.map((g: Row) => mapVariationGroup(g, row.variations ?? []))
      .sort((a: VariationGroup, b: VariationGroup) => a.sortOrder - b.sortOrder),
    addOns: row.add_ons?.map(mapAddOn),
    discountPrice: row.discount_price ?? undefined,
    discountStartDate: row.discount_start_date ?? undefined,
    discountEndDate: row.discount_end_date ?? undefined,
    discountActive: row.discount_active ?? false,
    effectivePrice,
    isOnDiscount: isDiscountActive,
    trackInventory: row.track_inventory ?? false,
    stockQuantity: row.stock_quantity ?? null,
    lowStockThreshold: row.low_stock_threshold ?? 0,
    autoDisabled: row.track_inventory ? row.available === false : false,
  };
};
