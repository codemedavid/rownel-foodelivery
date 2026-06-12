// Data access layer for delivery operations on Supabase. Replaces the Convex
// queries/mutations/actions. Row mapping converts snake_case columns and ISO
// timestamps into the camelCase / epoch-ms shapes in deliveryTypes.

import { supabase } from './supabase';
import type {
  CreateOrderInput,
  DispatchSettings,
  EarningsSummary,
  LocationPermission,
  OfferWithOrder,
  Order,
  OrderItem,
  OrderMessage,
  Payout,
  RiderPresence,
  RiderRating,
  StaffOrderStatus,
  StaffRecord,
} from './deliveryTypes';

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

const ms = (v: string | null | undefined): number | undefined =>
  v ? new Date(v).getTime() : undefined;

const num = (v: unknown): number | undefined =>
  v == null ? undefined : Number(v);

function mapOrderItem(row: Record<string, any>): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    itemId: row.item_id,
    name: row.name,
    variation: row.variation ?? undefined,
    addOns: row.add_ons ?? undefined,
    unitPrice: Number(row.unit_price),
    quantity: Number(row.quantity),
    subtotal: Number(row.subtotal),
  };
}

export function mapOrder(row: Record<string, any>): Order {
  return {
    id: row.id,
    createdAt: ms(row.created_at) ?? 0,
    merchantId: row.merchant_id,
    customerName: row.customer_name,
    contactNumber: row.contact_number,
    serviceType: row.service_type,
    address: row.address ?? undefined,
    deliveryLatitude: num(row.delivery_latitude),
    deliveryLongitude: num(row.delivery_longitude),
    merchantLatitude: num(row.merchant_latitude),
    merchantLongitude: num(row.merchant_longitude),
    distanceKm: num(row.distance_km),
    deliveryFee: num(row.delivery_fee),
    deliveryFeeBreakdown: row.delivery_fee_breakdown ?? undefined,
    deliveryMode: row.delivery_mode ?? undefined,
    pickupTime: row.pickup_time ?? undefined,
    partySize: num(row.party_size),
    dineInTime: row.dine_in_time ?? undefined,
    paymentMethod: row.payment_method,
    referenceNumber: row.reference_number ?? undefined,
    notes: row.notes ?? undefined,
    total: Number(row.total),
    status: row.status,
    receiptUrl: row.receipt_url ?? undefined,
    staffId: row.staff_id ?? undefined,
    assignedRiderId: row.assigned_rider_id ?? undefined,
    riderAssignedAt: ms(row.rider_assigned_at),
    pickedUpAt: ms(row.picked_up_at),
    deliveredAt: ms(row.delivered_at),
    riderEarning: num(row.rider_earning),
    payoutId: row.payout_id ?? undefined,
    order_items: Array.isArray(row.order_items) ? row.order_items.map(mapOrderItem) : [],
  };
}

function mapPresence(row: Record<string, any>): RiderPresence {
  return {
    riderId: row.rider_id,
    currentLatitude: row.latitude != null ? Number(row.latitude) : null,
    currentLongitude: row.longitude != null ? Number(row.longitude) : null,
    lastLocationUpdate: ms(row.last_location_update) ?? null,
    status: row.status,
    locationPermission: row.location_permission,
  };
}

function mapMessage(row: Record<string, any>): OrderMessage {
  return {
    id: row.id,
    orderId: row.order_id,
    senderType: row.sender_type,
    senderId: row.sender_id,
    text: row.text,
    readAt: ms(row.read_at) ?? null,
    createdAt: ms(row.created_at) ?? 0,
  };
}

function mapPayout(row: Record<string, any>): Payout {
  return {
    id: row.id,
    riderId: row.rider_id,
    amount: Number(row.amount),
    status: row.status,
    notes: row.notes ?? undefined,
    periodFrom: ms(row.period_from),
    periodTo: ms(row.period_to),
    createdAt: ms(row.created_at) ?? 0,
    paidAt: ms(row.paid_at),
    createdBy: row.created_by,
  };
}

function mapStaff(row: Record<string, any>): StaffRecord {
  return {
    id: row.id,
    supabaseUserId: row.supabase_user_id,
    email: row.email,
    name: row.name,
    merchantIds: row.merchant_ids ?? [],
    allMerchants: !!row.all_merchants,
    isActive: !!row.is_active,
    createdAt: ms(row.created_at) ?? 0,
  };
}

function throwIf(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const ORDER_WITH_ITEMS = '*, order_items(*)';
/** Cap on dashboard order lists — keeps payloads and egress sane. */
const ORDER_LIST_LIMIT = 300;

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const ordersApi = {
  /** Public order creation (validation, inventory, dispatch happen server-side). */
  async create(input: CreateOrderInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_order', { p: input });
    throwIf(error);
    return data as string;
  },

  /** Admin: recent orders across all merchants. */
  async listAll(): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_WITH_ITEMS)
      .order('created_at', { ascending: false })
      .limit(ORDER_LIST_LIMIT);
    throwIf(error);
    return (data ?? []).map(mapOrder);
  },

  /** Staff: orders for the given merchants (RLS enforces access). */
  async listByMerchants(merchantIds: string[]): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_WITH_ITEMS)
      .in('merchant_id', merchantIds)
      .order('created_at', { ascending: false })
      .limit(ORDER_LIST_LIMIT);
    throwIf(error);
    return (data ?? []).map(mapOrder);
  },

  /** Public: single order for customer tracking (server strips IP). */
  async getPublicById(orderId: string): Promise<Order | null> {
    const { data, error } = await supabase.rpc('get_order_public', { p_order_id: orderId });
    throwIf(error);
    return data ? mapOrder(data as Record<string, any>) : null;
  },

  /** Public: customer self-lookup by contact number (server strips GPS/IP). */
  async listByContactNumber(contactNumber: string): Promise<Order[]> {
    const { data, error } = await supabase.rpc('list_orders_by_contact', {
      p_contact_number: contactNumber,
    });
    throwIf(error);
    return ((data as Record<string, any>[]) ?? []).map(mapOrder);
  },

  async updateStatus(orderId: string, status: StaffOrderStatus): Promise<void> {
    const { error } = await supabase.rpc('update_order_status', {
      p_order_id: orderId,
      p_status: status,
    });
    throwIf(error);
  },

  async markPickedUp(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_order_picked_up', { p_order_id: orderId });
    throwIf(error);
  },

  async markDelivered(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_order_delivered', { p_order_id: orderId });
    throwIf(error);
  },

  /** Public: active delivery count for a rider (customer ETA context). */
  async publicRiderSummary(riderId: string): Promise<{ activeDeliveries: number }> {
    const { data, error } = await supabase.rpc('public_rider_summary', { p_rider_id: riderId });
    throwIf(error);
    return (data as { activeDeliveries: number }) ?? { activeDeliveries: 0 };
  },
};

// ---------------------------------------------------------------------------
// Riders (presence + rider-facing order views)
// ---------------------------------------------------------------------------

export const ridersApi = {
  async myPresence(userId: string): Promise<RiderPresence | null> {
    const { data, error } = await supabase
      .from('rider_presence')
      .select('*')
      .eq('rider_id', userId)
      .maybeSingle();
    throwIf(error);
    return data ? mapPresence(data) : null;
  },

  async updateLocation(latitude: number, longitude: number): Promise<void> {
    const { error } = await supabase.rpc('rider_update_location', {
      p_latitude: latitude,
      p_longitude: longitude,
    });
    throwIf(error);
  },

  async setLocationPermission(permission: LocationPermission): Promise<void> {
    const { error } = await supabase.rpc('rider_set_location_permission', {
      p_permission: permission,
    });
    throwIf(error);
  },

  async setOnline(online: boolean): Promise<void> {
    const { error } = await supabase.rpc('rider_set_online', { p_online: online });
    throwIf(error);
  },

  async adminSetOffline(riderId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_set_rider_offline', { p_rider_id: riderId });
    throwIf(error);
  },

  /** Admin/staff: all currently available riders. */
  async listAvailable(): Promise<RiderPresence[]> {
    const { data, error } = await supabase
      .from('rider_presence')
      .select('*')
      .eq('status', 'available');
    throwIf(error);
    return (data ?? []).map(mapPresence);
  },

  /** Public: lat/lng of available riders (no PII) for customer maps. */
  async listAvailableLocations(): Promise<{ id: string; latitude: number; longitude: number }[]> {
    const { data, error } = await supabase.rpc('available_rider_locations');
    throwIf(error);
    return (data as { id: string; latitude: number; longitude: number }[]) ?? [];
  },

  /** Public: presence of one rider for customer live tracking. */
  async getPresenceById(riderId: string): Promise<{
    status: string;
    lastLocationUpdate: number | null;
    currentLatitude: number | null;
    currentLongitude: number | null;
  } | null> {
    const { data, error } = await supabase.rpc('get_rider_presence', { p_rider_id: riderId });
    throwIf(error);
    if (!data) return null;
    const d = data as Record<string, any>;
    return {
      status: d.status,
      lastLocationUpdate: ms(d.lastLocationUpdate) ?? null,
      currentLatitude: d.currentLatitude != null ? Number(d.currentLatitude) : null,
      currentLongitude: d.currentLongitude != null ? Number(d.currentLongitude) : null,
    };
  },

  /** Rider: own active (not completed/cancelled) orders, items included. */
  async myActiveOrders(userId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_WITH_ITEMS)
      .eq('assigned_rider_id', userId)
      .not('status', 'in', '("completed","cancelled")')
      .order('created_at', { ascending: false });
    throwIf(error);
    return (data ?? []).map(mapOrder);
  },

  /** Rider: completed deliveries, newest first. */
  async myDeliveryHistory(userId: string, limit = 50): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('assigned_rider_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);
    throwIf(error);
    return (data ?? []).map(mapOrder);
  },
};

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

export const offersApi = {
  /** Rider: live pending offers with their orders. */
  async listMyOffers(userId: string): Promise<OfferWithOrder[]> {
    const { data, error } = await supabase
      .from('order_offers')
      .select('*, orders(*, order_items(*))')
      .eq('rider_id', userId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());
    throwIf(error);
    return (data ?? []).map((row: Record<string, any>) => ({
      offer: {
        id: row.id,
        orderId: row.order_id,
        riderId: row.rider_id,
        status: row.status,
        offeredAt: ms(row.offered_at) ?? 0,
        expiresAt: ms(row.expires_at) ?? 0,
        distanceKm: num(row.distance_km),
        respondedAt: ms(row.responded_at),
      },
      order: row.orders ? mapOrder(row.orders) : null,
    }));
  },

  async accept(offerId: string): Promise<string> {
    const { data, error } = await supabase.rpc('accept_offer', { p_offer_id: offerId });
    throwIf(error);
    return data as string;
  },

  async reject(offerId: string): Promise<void> {
    const { error } = await supabase.rpc('reject_offer', { p_offer_id: offerId });
    throwIf(error);
  },
};

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const messagesApi = {
  async listByOrder(orderId: string, contactNumber?: string): Promise<OrderMessage[]> {
    const { data, error } = await supabase.rpc('list_order_messages', {
      p_order_id: orderId,
      p_contact_number: contactNumber ?? null,
    });
    throwIf(error);
    return (data ?? []).map(mapMessage);
  },

  async send(args: {
    orderId: string;
    senderType: 'customer' | 'rider';
    text: string;
    contactNumber?: string;
  }): Promise<void> {
    const { error } = await supabase.rpc('send_order_message', {
      p_order_id: args.orderId,
      p_sender_type: args.senderType,
      p_text: args.text,
      p_contact_number: args.contactNumber ?? null,
    });
    throwIf(error);
  },

  async markRead(orderId: string, contactNumber?: string): Promise<void> {
    const { error } = await supabase.rpc('mark_order_messages_read', {
      p_order_id: orderId,
      p_contact_number: contactNumber ?? null,
    });
    throwIf(error);
  },

  async unreadCountForRider(): Promise<number> {
    const { data, error } = await supabase.rpc('rider_unread_message_count');
    throwIf(error);
    return (data as number) ?? 0;
  },
};

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

export const ratingsApi = {
  async submit(args: {
    orderId: string;
    contactNumber: string;
    rating: number;
    comment?: string;
  }): Promise<void> {
    const { error } = await supabase.rpc('submit_rider_rating', {
      p_order_id: args.orderId,
      p_contact_number: args.contactNumber,
      p_rating: args.rating,
      p_comment: args.comment ?? null,
    });
    throwIf(error);
  },

  /** Public: rating for an order (no customer contact exposed). */
  async getForOrder(orderId: string): Promise<Pick<RiderRating, 'rating' | 'comment'> | null> {
    const { data, error } = await supabase.rpc('get_order_rating', { p_order_id: orderId });
    throwIf(error);
    if (!data) return null;
    const d = data as Record<string, any>;
    return { rating: Number(d.rating), comment: d.comment ?? undefined };
  },
};

// ---------------------------------------------------------------------------
// Earnings / payouts
// ---------------------------------------------------------------------------

export const earningsApi = {
  async adminRiderOrders(args: {
    riderId: string;
    from?: number;
    to?: number;
    unpaidOnly?: boolean;
  }): Promise<Order[]> {
    let q = supabase
      .from('orders')
      .select('*')
      .eq('assigned_rider_id', args.riderId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(ORDER_LIST_LIMIT);
    if (args.from) q = q.gte('created_at', new Date(args.from).toISOString());
    if (args.to) q = q.lte('created_at', new Date(args.to).toISOString());
    if (args.unpaidOnly) q = q.is('payout_id', null);
    const { data, error } = await q;
    throwIf(error);
    return (data ?? []).map(mapOrder);
  },

  async adminListPayouts(riderId?: string): Promise<Payout[]> {
    let q = supabase.from('payouts').select('*').order('created_at', { ascending: false });
    if (riderId) q = q.eq('rider_id', riderId);
    const { data, error } = await q;
    throwIf(error);
    return (data ?? []).map(mapPayout);
  },

  async adminCreatePayout(args: {
    riderId: string;
    amount: number;
    notes?: string;
    periodFrom?: number;
    periodTo?: number;
    orderEarnings: { orderId: string; earning: number }[];
  }): Promise<string> {
    const { data, error } = await supabase.rpc('admin_create_payout', {
      p_rider_id: args.riderId,
      p_amount: args.amount,
      p_order_earnings: args.orderEarnings,
      p_notes: args.notes ?? null,
      p_period_from: args.periodFrom ? new Date(args.periodFrom).toISOString() : null,
      p_period_to: args.periodTo ? new Date(args.periodTo).toISOString() : null,
    });
    throwIf(error);
    return data as string;
  },

  async adminMarkPaid(payoutId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_mark_payout_paid', { p_payout_id: payoutId });
    throwIf(error);
  },

  async adminCancelPayout(payoutId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_cancel_payout', { p_payout_id: payoutId });
    throwIf(error);
  },

  async myEarningsSummary(): Promise<EarningsSummary | null> {
    const { data, error } = await supabase.rpc('my_earnings_summary');
    throwIf(error);
    return (data as EarningsSummary) ?? null;
  },

  async myPayouts(userId: string): Promise<Payout[]> {
    const { data, error } = await supabase
      .from('payouts')
      .select('*')
      .eq('rider_id', userId)
      .order('created_at', { ascending: false });
    throwIf(error);
    return (data ?? []).map(mapPayout);
  },

  async myRecentDeliveries(userId: string, limit = 30): Promise<Order[]> {
    return ridersApi.myDeliveryHistory(userId, limit);
  },
};

// ---------------------------------------------------------------------------
// Dispatch settings
// ---------------------------------------------------------------------------

export const dispatchSettingsApi = {
  async get(): Promise<DispatchSettings> {
    const { data, error } = await supabase
      .from('dispatch_settings')
      .select('*')
      .eq('id', 1)
      .single();
    throwIf(error);
    return {
      offerRadiusKm: Number(data.offer_radius_km),
      offerExpiryMs: Number(data.offer_expiry_ms),
      maxConcurrentOffers: Number(data.max_concurrent_offers),
      locationStaleMs: Number(data.location_stale_ms),
      dispatchOnCreate: !!data.dispatch_on_create,
      maxConcurrentOrdersPerRider: Number(data.max_concurrent_orders_per_rider),
      batchTimeWindowMs: Number(data.batch_time_window_ms),
      batchProximityKm: Number(data.batch_proximity_km),
    };
  },

  async update(settings: DispatchSettings): Promise<void> {
    const { error } = await supabase.rpc('update_dispatch_settings', { p: settings });
    throwIf(error);
  },
};

// ---------------------------------------------------------------------------
// Staff management (account creation goes through the admin-users
// Edge Function, which holds the service-role key)
// ---------------------------------------------------------------------------

/**
 * Pull a `{ error }` payload out of a FunctionsHttpError's `context`. Its shape
 * varies by supabase-js version: a `Response` (has `.json()`/`.text()`), an
 * already-parsed body object, or undefined. Never throws — returns null on any
 * failure so the caller can fall back to the generic error message.
 */
async function extractErrorPayload(ctx: unknown): Promise<{ error?: string } | null> {
  if (!ctx) return null;
  try {
    if (typeof (ctx as Response).json === 'function') {
      return (await (ctx as Response).json()) as { error?: string };
    }
    if (typeof (ctx as Response).text === 'function') {
      const t = await (ctx as Response).text();
      return t ? (JSON.parse(t) as { error?: string }) : null;
    }
    if (typeof ctx === 'object') return ctx as { error?: string };
  } catch {
    // Body wasn't JSON or was already consumed — fall through to null.
  }
  return null;
}

async function invokeAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    // supabase-js wraps non-2xx in FunctionsHttpError; surface the server message.
    // `error.context` shape varies by supabase-js version: it may be a Response
    // (has .json()/.text()), an already-parsed body object, or undefined.
    const ctx = (error as { context?: unknown }).context;
    const payload = await extractErrorPayload(ctx);
    if (payload?.error) throw new Error(payload.error);
    throw new Error(error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const staffApi = {
  async listAll(): Promise<StaffRecord[]> {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('created_at', { ascending: false });
    throwIf(error);
    return (data ?? []).map(mapStaff);
  },

  async getBySupabaseUser(supabaseUserId: string): Promise<StaffRecord | null> {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('supabase_user_id', supabaseUserId)
      .maybeSingle();
    throwIf(error);
    return data ? mapStaff(data) : null;
  },

  async update(staffId: string, patch: { merchantIds?: string[]; allMerchants?: boolean }): Promise<void> {
    const update: Record<string, unknown> = {};
    if (patch.merchantIds !== undefined) update.merchant_ids = patch.merchantIds;
    if (patch.allMerchants !== undefined) update.all_merchants = patch.allMerchants;
    const { error } = await supabase.from('staff').update(update).eq('id', staffId);
    throwIf(error);
  },

  async setActive(staffId: string, isActive: boolean): Promise<void> {
    const { error } = await supabase.from('staff').update({ is_active: isActive }).eq('id', staffId);
    throwIf(error);
  },

  async adminCreateStaff(args: {
    email: string;
    password: string;
    name: string;
    merchantIds: string[];
    allMerchants?: boolean;
  }): Promise<{ userId: string }> {
    return invokeAdminUsers({ action: 'create-staff', ...args });
  },

  async adminCreateRider(args: {
    email: string;
    password: string;
    name: string;
    phone: string;
    plateNumber: string;
    vehicleType: 'motorcycle' | 'bicycle' | 'car';
    paymentMode?: 'fixed' | 'percentage';
    paymentValue?: number;
  }): Promise<{ userId: string }> {
    return invokeAdminUsers({ action: 'create-rider', ...args });
  },

  async adminSetRole(userId: string, role: 'staff' | 'rider'): Promise<void> {
    await invokeAdminUsers({ action: 'set-role', userId, role });
  },
};
