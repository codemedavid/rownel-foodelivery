// Delivery-ops domain types for the staff/admin surface. Ported from the web
// app's src/lib/deliveryTypes.ts; timestamps are epoch milliseconds.

import type { DeliveryMode, ServiceType } from '../types';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'cancelled',
];

/** Statuses staff can set directly (rider flow owns out_for_delivery). */
export type StaffOrderStatus = Exclude<OrderStatus, 'out_for_delivery'>;

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
  distanceKm?: number;
  deliveryFee?: number;
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
  customerUserId?: string;
  order_items: OrderItem[];
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

export type RiderPresenceStatus = 'offline' | 'available' | 'busy';
export type VehicleType = 'motorcycle' | 'bicycle' | 'car';

/** Row from list_riders_for_assignment(). */
export interface RiderSummary {
  id: string;
  name: string;
  phone: string;
  plateNumber: string;
  vehicleType: VehicleType;
  presenceStatus: RiderPresenceStatus;
  lastLocationUpdate: number | null;
  activeOrderCount: number;
  maxOrders: number;
}

/** Full rider row for the admin riders screen. */
export interface RiderRecord {
  id: string;
  name: string;
  phone: string;
  plateNumber: string;
  vehicleType: VehicleType;
  photoUrl?: string;
  isApproved: boolean;
  isActive: boolean;
  ratingSum: number;
  ratingCount: number;
  paymentMode?: 'fixed' | 'percentage';
  paymentValue?: number;
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

export type NotificationKind = 'new_order' | 'status_change' | 'rider_assigned';
export type NotificationTarget = 'admin' | 'customer';

export interface NotificationData {
  orderId?: string;
  status?: string;
  merchantId?: string;
  target?: NotificationTarget;
}

export interface AppNotification {
  id: string;
  recipientUserId: string;
  orderId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  data: NotificationData;
  readAt: number | null;
  createdAt: number;
}

export type PushPlatform = 'ios' | 'android';

export interface PushTokenRow {
  token: string;
  user_id: string;
  platform: PushPlatform;
  device_name?: string;
  app_version?: string;
}

export interface SalesTotals {
  grossSales: number;
  deliveryFees: number;
  orderCount: number;
  completedCount: number;
  cancelledCount: number;
  avgOrderValue: number;
}

export interface DailySalesPoint {
  day: string;
  sales: number;
  orders: number;
  completed: number;
}

export interface TopItem {
  itemId: string;
  name: string;
  quantity: number;
  sales: number;
}

export interface TopMerchant {
  merchantId: string;
  name: string;
  sales: number;
  orders: number;
}

export interface SalesSummary {
  totals: SalesTotals;
  countsByStatus: Record<OrderStatus, number>;
  byServiceType: Record<ServiceType, { count: number; sales: number }>;
  daily: DailySalesPoint[];
  topItems: TopItem[];
  topMerchants: TopMerchant[];
}
