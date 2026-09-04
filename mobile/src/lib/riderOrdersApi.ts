import { supabase } from './supabase';
import { mapOrder } from './adminMappers';
import type { Order } from './adminTypes';

const ORDER_WITH_ITEMS = '*, order_items(*)';
const HISTORY_LIMIT = 50;

const rows = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

export const riderOrdersApi = {
  /** Deliveries the rider is currently carrying. */
  async listActive(riderId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_WITH_ITEMS)
      .eq('assigned_rider_id', riderId)
      .not('status', 'in', '("completed","cancelled")')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return rows(data).map(mapOrder);
  },

  async listHistory(riderId: string, limit = HISTORY_LIMIT): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_WITH_ITEMS)
      .eq('assigned_rider_id', riderId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);
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

  async markPickedUp(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_order_picked_up', { p_order_id: orderId });
    if (error) throw new Error(error.message);
  },

  async markDelivered(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_order_delivered', { p_order_id: orderId });
    if (error) throw new Error(error.message);
  },
};
