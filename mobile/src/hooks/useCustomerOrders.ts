import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { loadOrderHistory } from '../lib/orderHistory';
import { mergeAccountOrders, type CustomerOrder } from '../lib/customerOrders';
import { useAuth } from '../context/AuthContext';

/** How many status-less orders we are willing to look up on each refresh. */
const STATUS_LOOKUP_LIMIT = 10;

const loadAccountOrders = async (): Promise<CustomerOrder[]> => {
  try {
    const { data, error } = await supabase.rpc('list_my_orders');
    if (error || !Array.isArray(data)) return [];
    return data.map((row: Record<string, unknown>) => ({
      orderId: String(row.id),
      merchantName: 'Your account order',
      total: Number(row.total ?? 0),
      placedAt: row.created_at ? new Date(String(row.created_at)).getTime() : 0,
      status: typeof row.status === 'string' ? row.status : undefined,
    }));
  } catch (err) {
    console.warn('Failed to load account orders:', err);
    return [];
  }
};

/** Fetches live statuses for device orders that don't carry one yet. */
const fetchMissingStatuses = async (
  orders: readonly CustomerOrder[]
): Promise<Map<string, string>> => {
  const pending = orders.filter((entry) => !entry.status).slice(0, STATUS_LOOKUP_LIMIT);
  const results = await Promise.allSettled(
    pending.map((entry) => supabase.rpc('get_order_public', { p_order_id: entry.orderId }))
  );

  const statusById = new Map<string, string>();
  results.forEach((result, index) => {
    if (result.status !== 'fulfilled' || result.value.error || !result.value.data) return;
    const row = result.value.data as { status?: string };
    if (row.status) statusById.set(pending[index].orderId, row.status);
  });
  return statusById;
};

/**
 * Customer order history: device-local orders merged with the signed-in
 * account's orders, refreshed whenever the screen regains focus.
 */
export const useCustomerOrders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    const local: CustomerOrder[] = (await loadOrderHistory()).map((record) => ({ ...record }));
    const account = user ? await loadAccountOrders() : [];
    const merged = mergeAccountOrders(local, account);
    const statusById = await fetchMissingStatuses(merged);

    setOrders(
      merged.map((entry) => ({ ...entry, status: entry.status ?? statusById.get(entry.orderId) }))
    );
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  return { orders, isRefreshing, refresh };
};
