// Shared domain types — mirrored from the web app (src/types/index.ts)
export interface Merchant {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  category: string;
  cuisineType?: string;
  deliveryFee: number;
  minimumOrder: number;
  estimatedDeliveryTime?: string;
  rating: number;
  totalReviews: number;
  active: boolean;
  featured: boolean;
  address?: string;
  contactNumber?: string;
  openingHours?: Record<string, string>;
  paymentMethods?: string[];
  baseDeliveryFee?: number;
  deliveryFeePerKm?: number;
  minDeliveryFee?: number | null;
  maxDeliveryFee?: number | null;
  maxDeliveryDistanceKm?: number | null;
  fixedDeliveryFee?: number;
  latitude?: number | null;
  longitude?: number | null;
}

export interface Variation {
  id: string;
  name: string;
  price: number;
  variationGroup?: string;
  sortOrder?: number;
}

export interface VariationGroup {
  id: string;
  name: string;
  required: boolean;
  sortOrder: number;
  variations: Variation[];
}

export interface AddOn {
  id: string;
  name: string;
  price: number;
  category: string;
  quantity?: number;
}

export interface MenuItem {
  id: string;
  merchantId: string;
  name: string;
  description: string;
  basePrice: number;
  category: string;
  image?: string;
  popular?: boolean;
  available?: boolean;
  variations?: Variation[];
  variationGroups?: VariationGroup[];
  addOns?: AddOn[];
  discountPrice?: number;
  discountStartDate?: string;
  discountEndDate?: string;
  discountActive?: boolean;
  effectivePrice?: number;
  isOnDiscount?: boolean;
  trackInventory?: boolean;
  stockQuantity?: number | null;
  lowStockThreshold?: number;
  autoDisabled?: boolean;
}

export interface CartItem extends MenuItem {
  lineId: string;
  menuItemId: string;
  quantity: number;
  selectedVariations?: Record<string, Variation>;
  selectedAddOns?: AddOn[];
  totalPrice: number;
}

export type ServiceType = 'dine-in' | 'pickup' | 'delivery';
export type PaymentMethod = 'gcash' | 'maya' | 'bank-transfer';
export type DeliveryMode = 'priority' | 'economy';

export interface OrderData {
  merchantId: string;
  items: CartItem[];
  customerName: string;
  contactNumber: string;
  serviceType: ServiceType;
  address?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  distanceKm?: number;
  deliveryFee?: number;
  deliveryFeeBreakdown?: Record<string, unknown>;
  deliveryMode?: DeliveryMode;
  pickupTime?: string;
  partySize?: number;
  dineInTime?: string;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  total: number;
  notes?: string;
}
