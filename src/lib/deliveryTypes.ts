// Shared types for the delivery-ops domain (orders, riders, dispatch, chat,
// earnings) now backed by Supabase. Timestamps are epoch milliseconds so
// existing date math keeps working.

export type ServiceType = 'dine-in' | 'pickup' | 'delivery';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

/** Statuses staff can set directly (rider flow owns out_for_delivery). */
export type StaffOrderStatus = Exclude<OrderStatus, 'out_for_delivery'>;

export type DeliveryMode = 'priority' | 'economy';

export interface OrderItem {
  id: string;
  orderId: string;
  itemId: string;
  name: string;
  variation?: unknown;
  addOns?: unknown;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: string;
  createdAt: number;
  merchantId: string;
  customerName: string;
  contactNumber: string;
  serviceType: ServiceType;
  address?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  merchantLatitude?: number;
  merchantLongitude?: number;
  distanceKm?: number;
  deliveryFee?: number;
  deliveryFeeBreakdown?: Record<string, unknown>;
  deliveryMode?: DeliveryMode;
  pickupTime?: string;
  partySize?: number;
  dineInTime?: string;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  total: number;
  status: OrderStatus;
  receiptUrl?: string;
  staffId?: string;
  assignedRiderId?: string;
  riderAssignedAt?: number;
  pickedUpAt?: number;
  deliveredAt?: number;
  riderEarning?: number;
  payoutId?: string;
  order_items: OrderItem[];
}

export interface CreateOrderInput {
  merchantId: string;
  customerName: string;
  contactNumber: string;
  serviceType: ServiceType;
  address?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  merchantLatitude?: number;
  merchantLongitude?: number;
  distanceKm?: number;
  deliveryFee?: number;
  deliveryFeeBreakdown?: Record<string, unknown>;
  deliveryMode?: DeliveryMode;
  pickupTime?: string;
  partySize?: number;
  dineInTime?: string;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  total: number;
  ipAddress?: string;
  receiptUrl?: string;
  items: {
    itemId: string;
    name: string;
    variation?: unknown;
    addOns?: unknown;
    unitPrice: number;
    quantity: number;
    subtotal: number;
  }[];
  /** Cart quantities used to decrement tracked inventory. */
  stockAdjustments?: { id: string; quantity: number }[];
}

export type RiderStatus = 'offline' | 'available' | 'busy';
export type LocationPermission = 'granted' | 'denied' | 'unknown';

export interface RiderPresence {
  riderId: string;
  currentLatitude: number | null;
  currentLongitude: number | null;
  lastLocationUpdate: number | null;
  status: RiderStatus;
  locationPermission: LocationPermission;
}

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface OrderOffer {
  id: string;
  orderId: string;
  riderId: string;
  status: OfferStatus;
  offeredAt: number;
  expiresAt: number;
  distanceKm?: number;
  respondedAt?: number;
}

export interface OfferWithOrder {
  offer: OrderOffer;
  order: Order | null;
}

export interface OrderMessage {
  id: string;
  orderId: string;
  senderType: 'customer' | 'rider';
  senderId: string;
  text: string;
  readAt: number | null;
  createdAt: number;
}

export interface DispatchSettings {
  offerRadiusKm: number;
  offerExpiryMs: number;
  maxConcurrentOffers: number;
  locationStaleMs: number;
  dispatchOnCreate: boolean;
  maxConcurrentOrdersPerRider: number;
  batchTimeWindowMs: number;
  batchProximityKm: number;
}

export type PayoutStatus = 'pending' | 'paid' | 'cancelled';

export interface Payout {
  id: string;
  riderId: string;
  amount: number;
  status: PayoutStatus;
  notes?: string;
  periodFrom?: number;
  periodTo?: number;
  createdAt: number;
  paidAt?: number;
  createdBy: string;
}

export interface RiderRating {
  id: string;
  orderId: string;
  riderId: string;
  rating: number;
  comment?: string;
  createdAt: number;
}

export interface EarningsSummary {
  totalEarned: number;
  totalPaid: number;
  pendingPayout: number;
  unpaidEarnings: number;
  todayEarnings: number;
  completedCount: number;
  todayCount: number;
}

export interface StaffRecord {
  id: string;
  supabaseUserId: string;
  email: string;
  name: string;
  merchantIds: string[];
  allMerchants: boolean;
  isActive: boolean;
  createdAt: number;
}
