// Row -> domain mappers for the staff/admin surface (snake_case + ISO -> camelCase + epoch ms).

import type {
  AppNotification,
  DispatchSettings,
  NotificationData,
  Order,
  OrderItem,
  RiderRecord,
  RiderSummary,
  StaffRecord,
} from './adminTypes';

type Row = Record<string, unknown>;

const ms = (v: unknown): number | undefined =>
  typeof v === 'string' && v ? new Date(v).getTime() : undefined;

const num = (v: unknown): number | undefined => (v == null ? undefined : Number(v));

const str = (v: unknown): string | undefined => (v == null ? undefined : String(v));

const mapOrderItem = (row: Row): OrderItem => ({
  id: String(row.id),
  orderId: String(row.order_id),
  itemId: String(row.item_id ?? ''),
  name: String(row.name ?? ''),
  variation: row.variation ?? undefined,
  addOns: row.add_ons ?? undefined,
  unitPrice: Number(row.unit_price ?? 0),
  quantity: Number(row.quantity ?? 0),
  subtotal: Number(row.subtotal ?? 0),
});

export const mapOrder = (row: Row): Order => ({
  id: String(row.id),
  createdAt: ms(row.created_at) ?? 0,
  merchantId: String(row.merchant_id ?? ''),
  customerName: String(row.customer_name ?? ''),
  contactNumber: String(row.contact_number ?? ''),
  serviceType: (row.service_type as Order['serviceType']) ?? 'delivery',
  address: str(row.address),
  deliveryLatitude: num(row.delivery_latitude),
  deliveryLongitude: num(row.delivery_longitude),
  merchantLatitude: num(row.merchant_latitude),
  merchantLongitude: num(row.merchant_longitude),
  distanceKm: num(row.distance_km),
  deliveryFee: num(row.delivery_fee),
  deliveryMode: (row.delivery_mode as Order['deliveryMode']) ?? undefined,
  pickupTime: str(row.pickup_time),
  partySize: num(row.party_size),
  dineInTime: str(row.dine_in_time),
  paymentMethod: String(row.payment_method ?? ''),
  referenceNumber: str(row.reference_number),
  notes: str(row.notes),
  total: Number(row.total ?? 0),
  status: row.status as Order['status'],
  receiptUrl: str(row.receipt_url),
  staffId: str(row.staff_id),
  assignedRiderId: str(row.assigned_rider_id),
  riderAssignedAt: ms(row.rider_assigned_at),
  pickedUpAt: ms(row.picked_up_at),
  deliveredAt: ms(row.delivered_at),
  customerUserId: str(row.customer_user_id),
  order_items: Array.isArray(row.order_items) ? (row.order_items as Row[]).map(mapOrderItem) : [],
});

export const mapStaff = (row: Row): StaffRecord => ({
  id: String(row.id),
  supabaseUserId: String(row.supabase_user_id),
  email: String(row.email ?? ''),
  name: String(row.name ?? ''),
  merchantIds: Array.isArray(row.merchant_ids) ? (row.merchant_ids as string[]) : [],
  allMerchants: !!row.all_merchants,
  isActive: !!row.is_active,
  createdAt: ms(row.created_at) ?? 0,
});

export const mapRiderSummary = (row: Row): RiderSummary => ({
  id: String(row.id),
  name: String(row.name ?? ''),
  phone: String(row.phone ?? ''),
  plateNumber: String(row.plateNumber ?? ''),
  vehicleType: (row.vehicleType as RiderSummary['vehicleType']) ?? 'motorcycle',
  presenceStatus: (row.presenceStatus as RiderSummary['presenceStatus']) ?? 'offline',
  lastLocationUpdate: ms(row.lastLocationUpdate) ?? null,
  activeOrderCount: Number(row.activeOrderCount ?? 0),
  maxOrders: Number(row.maxOrders ?? 0),
});

export const mapRider = (row: Row): RiderRecord => ({
  id: String(row.id),
  name: String(row.name ?? ''),
  phone: String(row.phone ?? ''),
  plateNumber: String(row.plate_number ?? ''),
  vehicleType: (row.vehicle_type as RiderRecord['vehicleType']) ?? 'motorcycle',
  photoUrl: str(row.photo_url),
  isApproved: !!row.is_approved,
  isActive: !!row.is_active,
  ratingSum: Number(row.rating_sum ?? 0),
  ratingCount: Number(row.rating_count ?? 0),
  paymentMode: (row.payment_mode as RiderRecord['paymentMode']) ?? undefined,
  paymentValue: num(row.payment_value),
  createdAt: ms(row.created_at) ?? 0,
});

export const mapNotification = (row: Row): AppNotification => ({
  id: String(row.id),
  recipientUserId: String(row.recipient_user_id),
  orderId: row.order_id == null ? null : String(row.order_id),
  kind: row.kind as AppNotification['kind'],
  title: String(row.title ?? ''),
  body: String(row.body ?? ''),
  data: (row.data && typeof row.data === 'object' ? row.data : {}) as NotificationData,
  readAt: ms(row.read_at) ?? null,
  createdAt: ms(row.created_at) ?? 0,
});

export const mapDispatchSettings = (row: Row): DispatchSettings => ({
  offerRadiusKm: Number(row.offer_radius_km ?? 0),
  offerExpiryMs: Number(row.offer_expiry_ms ?? 0),
  maxConcurrentOffers: Number(row.max_concurrent_offers ?? 0),
  locationStaleMs: Number(row.location_stale_ms ?? 0),
  dispatchOnCreate: !!row.dispatch_on_create,
  maxConcurrentOrdersPerRider: Number(row.max_concurrent_orders_per_rider ?? 0),
  batchTimeWindowMs: Number(row.batch_time_window_ms ?? 0),
  batchProximityKm: Number(row.batch_proximity_km ?? 0),
});
