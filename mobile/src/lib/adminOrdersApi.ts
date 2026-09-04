import { supabase } from './supabase';
import { mapOrder } from './adminMappers';
import type { Order, StaffOrderStatus } from './adminTypes';

const ORDER_WITH_ITEMS = '*, order_items(*)';
const LIST_LIMIT = 300;

const rows = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

export const adminOrdersApi = {
  async listAll(): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_WITH_ITEMS)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (error) throw new Error(error.message);
    return rows(data).map(mapOrder);
  },

  async listByMerchants(merchantIds: readonly string[]): Promise<Order[]> {
    if (merchantIds.length === 0) return [];
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_WITH_ITEMS)
      .in('merchant_id', [...merchantIds])
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (error) throw new Error(error.message);
    return rows(data).map(mapOrder);
  },

  async getById(orderId: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_WITH_ITEMS)
      .eq('id', orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapOrder(data as Record<string, unknown>) : null;
  },

  async updateStatus(orderId: string, status: StaffOrderStatus): Promise<void> {
    const { error } = await supabase.rpc('update_order_status', {
      p_order_id: orderId,
      p_status: status,
    });
    if (error) throw new Error(error.message);
  },

  async assignRider(orderId: string, riderId: string): Promise<void> {
    const { error } = await supabase.rpc('assign_rider_to_order', {
      p_order_id: orderId,
      p_rider_id: riderId,
    });
    if (error) throw new Error(error.message);
  },

  async unassignRider(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('unassign_rider_from_order', { p_order_id: orderId });
    if (error) throw new Error(error.message);
  },

  async riderName(riderId: string): Promise<string | null> {
    return riderNameFor(riderId);
  },

  async pendingOfferCount(orderId: string): Promise<number> {
    const { count, error } = await supabase
      .from('order_offers')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .eq('status', 'pending');
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
};

/** Rider display name via the public summary RPC (readable by staff). */
export const riderNameFor = async (riderId: string): Promise<string | null> => {
  const { data, error } = await supabase.from('riders').select('name').eq('id', riderId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { name?: string } | null)?.name ?? null;
};
