// Order hooks backed by Supabase — drop-in successors to useConvexOrders.
//
// Authenticated dashboards (admin/staff) use realtime invalidation on the
// orders table; anonymous customer views poll public RPCs at low frequency.

import { useCallback } from 'react';
import { ordersApi } from '../lib/deliveryApi';
import type { CreateOrderInput, Order, StaffOrderStatus } from '../lib/deliveryTypes';
import { useLiveQuery } from './useLiveQuery';

export type { Order, OrderItem } from '../lib/deliveryTypes';

export async function createOrder(args: CreateOrderInput): Promise<string> {
  return ordersApi.create(args);
}

export async function updateOrderStatus(orderId: string, status: StaffOrderStatus): Promise<void> {
  return ordersApi.updateStatus(orderId, status);
}

/** Admin view — all recent orders, realtime. */
export function useAdminOrders() {
  const { data, loading, refetch } = useLiveQuery<Order[]>(
    () => ordersApi.listAll(),
    [],
    { realtime: [{ table: 'orders' }], pollMs: 60_000 }
  );

  const update = useCallback(
    async (orderId: string, status: StaffOrderStatus) => {
      await ordersApi.updateStatus(orderId, status);
      refetch();
    },
    [refetch]
  );

  return { orders: data ?? [], loading, createOrder, updateOrderStatus: update, refetch };
}

/**
 * Staff view — orders for the staff member's merchants (or all, for
 * all-merchant staff). Pass `null` merchantIds while the staff record loads.
 */
export function useOrdersByMerchants(merchantIds: string[] | null, allMerchants: boolean) {
  const enabled = allMerchants || (merchantIds !== null && merchantIds.length > 0);
  const { data, loading, refetch } = useLiveQuery<Order[]>(
    () => (allMerchants ? ordersApi.listAll() : ordersApi.listByMerchants(merchantIds ?? [])),
    [allMerchants, merchantIds?.join(',')],
    { enabled, realtime: [{ table: 'orders' }], pollMs: 60_000 }
  );

  const update = useCallback(
    async (orderId: string, status: StaffOrderStatus) => {
      await ordersApi.updateStatus(orderId, status);
      refetch();
    },
    [refetch]
  );

  return { orders: data ?? [], loading, updateOrderStatus: update, refetch };
}

/** Customer self-lookup by contact number (anonymous; polls). */
export function useOrdersByPhone(contactNumber: string | null) {
  const trimmed = contactNumber?.trim() || null;
  const { data, loading } = useLiveQuery<Order[]>(
    () => ordersApi.listByContactNumber(trimmed!),
    [trimmed],
    { enabled: !!trimmed, pollMs: 20_000 }
  );
  return { orders: data ?? [], loading };
}

/** Customer order tracking by id (anonymous; polls while mounted). */
export function useOrderById(orderId: string | null) {
  const { data, loading, refetch } = useLiveQuery<Order | null>(
    () => ordersApi.getPublicById(orderId!),
    [orderId],
    { enabled: !!orderId, pollMs: 10_000 }
  );
  return { order: data ?? null, loading, refetch };
}
