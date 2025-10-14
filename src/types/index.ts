// Merchant Types
export interface Merchant {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  category: string; // 'restaurant', 'cafe', 'bakery', 'fast-food'
  cuisineType?: string; // 'Filipino', 'Chinese', 'Italian', etc.
  deliveryFee: number;
  minimumOrder: number;
  estimatedDeliveryTime?: string;
  rating: number;
  totalReviews: number;
  active: boolean;
  featured: boolean;
  address?: string;
  contactNumber?: string;
  email?: string;
  openingHours?: Record<string, string>; // e.g., { "monday": "09:00-22:00" }
  paymentMethods?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Variation {
  id: string;
  name: string;
  price: number;
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
  merchantId: string; // Link to merchant
  name: string;
  description: string;
  basePrice: number;
  category: string;
  image?: string;
  popular?: boolean;
  available?: boolean;
  variations?: Variation[];
  addOns?: AddOn[];
  // Discount pricing fields
  discountPrice?: number;
  discountStartDate?: string;
  discountEndDate?: string;
  discountActive?: boolean;
  // Computed effective price (calculated in the app)
  effectivePrice?: number;
  isOnDiscount?: boolean;
  // Inventory controls
  trackInventory?: boolean;
  stockQuantity?: number | null;
  lowStockThreshold?: number;
  autoDisabled?: boolean;
}

export interface CartItem extends MenuItem {
  quantity: number;
  selectedVariation?: Variation;
  selectedAddOns?: AddOn[];
  totalPrice: number;
  menuItemId: string;
}

export interface OrderData {
  merchantId: string; // Which merchant this order is for
  items: CartItem[];
  customerName: string;
  contactNumber: string;
  serviceType: 'dine-in' | 'pickup' | 'delivery';
  address?: string;
  pickupTime?: string;
  // Dine-in specific fields
  partySize?: number;
  dineInTime?: string;
  paymentMethod: 'gcash' | 'maya' | 'bank-transfer';
  referenceNumber?: string;
  total: number;
  notes?: string;
  receiptUrl?: string;
}

export type PaymentMethod = 'gcash' | 'maya' | 'bank-transfer';
export type ServiceType = 'dine-in' | 'pickup' | 'delivery';

// Site Settings Types
export interface SiteSetting {
  id: string;
  value: string;
  type: 'text' | 'image' | 'boolean' | 'number';
  description?: string;
  updated_at: string;
}

export interface SiteSettings {
  site_name: string;
  site_logo: string;
  site_description: string;
  currency: string;
  currency_code: string;
}
