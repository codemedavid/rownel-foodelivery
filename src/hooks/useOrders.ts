import { useState, useCallback, useEffect } from 'react';
import { supabase, type Database } from '../lib/supabase';
import type { CartItem } from '../types';

export interface CreateOrderPayload {
  merchantId: string;
  customerName: string;
  contactNumber: string;
  serviceType: 'dine-in' | 'pickup' | 'delivery';
  address?: string;
  pickupTime?: string;
  partySize?: number;
  dineInTime?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  notes?: string;
  total: number;
  items: CartItem[];
  receiptUrl?: string;
}

export interface OrderWithItems {
  id: string;
  customer_name: string;
  contact_number: string;
  service_type: 'dine-in' | 'pickup' | 'delivery';
  address: string | null;
  pickup_time: string | null;
  party_size: number | null;
  dine_in_time: string | null;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  total: number;
  status: string;
  created_at: string;
  receipt_url: string | null;
  order_items: {
    id: string;
    item_id: string;
    name: string;
    variation: any | null;
    add_ons: any | null;
    unit_price: number;
    quantity: number;
    subtotal: number;
  }[];
}

type OrderItemsTable = Database['public']['Tables']['order_items'];

export const useOrders = () => {
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [clientIp, setClientIp] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (*)
        `)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setOrders(data as OrderWithItems[] || []);
    } catch (err) {
      console.error('Error fetching orders:', err);
      const message = err instanceof Error ? err.message : 'Failed to fetch orders';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateOrderStatus = useCallback(async (orderId: string, status: string) => {
    try {
      setError(null);

      const { error: updateError } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId);

      if (updateError) throw updateError;

      // Refresh orders list
      await fetchOrders();
    } catch (err) {
      console.error('Error updating order status:', err);
      const message = err instanceof Error ? err.message : 'Failed to update order status';
      setError(message);
      throw err;
    }
  }, [fetchOrders]);

  const createOrder = useCallback(async (payload: CreateOrderPayload) => {
    try {
      setCreating(true);
      setError(null);

      const stockAdjustments = payload.items.reduce<Record<string, number>>((acc, item) => {
        const menuItemId = item.menuItemId || item.id;
        if (!menuItemId) return acc;
        acc[menuItemId] = (acc[menuItemId] || 0) + item.quantity;
        return acc;
      }, {});

      const stockedItemIds = Object.keys(stockAdjustments);

      if (stockedItemIds.length > 0) {
        const { data: inventorySnapshot, error: inventoryCheckError } = await supabase
          .from('menu_items')
          .select('id, track_inventory, stock_quantity')
          .in('id', stockedItemIds);

        if (inventoryCheckError) throw inventoryCheckError;

        const insufficientItem = inventorySnapshot?.find((row) =>
          row.track_inventory && (row.stock_quantity ?? 0) < stockAdjustments[row.id]
        );

        if (insufficientItem) {
          const offending = payload.items.find((item) => (item.menuItemId || item.id) === insufficientItem.id);
          throw new Error(`Insufficient stock for ${offending?.name ?? 'one of the items'}`);
        }
      }

      // 1) Insert order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_name: payload.customerName,
          contact_number: payload.contactNumber,
          service_type: payload.serviceType,
          address: payload.address ?? null,
          pickup_time: payload.pickupTime ?? null,
          party_size: payload.partySize ?? null,
          dine_in_time: payload.dineInTime ? new Date(payload.dineInTime).toISOString() : null,
          payment_method: payload.paymentMethod ?? 'cash',
          reference_number: payload.referenceNumber ?? null,
          notes: payload.notes ?? null,
          total: payload.total,
          ip_address: clientIp ?? null,
          receipt_url: payload.receiptUrl ?? null,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // 2) Insert order items
      const orderItems: OrderItemsTable['Insert'][] = payload.items.map((ci) => ({
        order_id: order.id,
        item_id: ci.menuItemId || ci.id,
        name: ci.name,
        variation: ci.selectedVariation
          ? { id: ci.selectedVariation.id, name: ci.selectedVariation.name, price: ci.selectedVariation.price }
          : null,
        add_ons: ci.selectedAddOns && ci.selectedAddOns.length > 0
          ? ci.selectedAddOns.map((a) => ({ id: a.id, name: a.name, price: a.price, quantity: a.quantity ?? 1 }))
          : null,
        unit_price: ci.totalPrice,
        quantity: ci.quantity,
        subtotal: ci.totalPrice * ci.quantity,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Decrement tracked inventory for purchased items
      const inventoryPayload = Object.entries(stockAdjustments).map(([id, quantity]) => ({ id, quantity }));

      if (inventoryPayload.length > 0) {
        const { error: inventoryError } = await supabase.rpc('decrement_menu_item_stock', {
          items: inventoryPayload,
        });

        if (inventoryError) {
          console.error('Failed to decrement inventory:', inventoryError);
        }
      }

      return order;
    } catch (err) {
      console.error('Error creating order:', err);
      const message = err instanceof Error ? err.message : 'Failed to create order';
      setError(message);
      throw err;
    } finally {
      setCreating(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();

    // Realtime subscriptions
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  // Fetch client IP once (best-effort)
  useEffect(() => {
    let cancelled = false;
    const fetchIp = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setClientIp(typeof data.ip === 'string' ? data.ip : null);
      } catch {
        // ignore
      }
    };
    if (!clientIp) fetchIp();
    return () => { cancelled = true; };
  }, [clientIp]);

  return { 
    createOrder, 
    creating, 
    error, 
    orders, 
    loading, 
    fetchOrders, 
    updateOrderStatus 
  };
};
