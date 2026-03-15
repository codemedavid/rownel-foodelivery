import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id, Doc } from "../../convex/_generated/dataModel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single order-item as returned by Convex (matches the orderItems table). */
export interface ConvexOrderItem {
  _id: Id<"orderItems">;
  _creationTime: number;
  orderId: Id<"orders">;
  itemId: string;
  name: string;
  variation?: any;
  addOns?: any;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

/** A full order with its nested items, as returned by the Convex queries. */
export type ConvexOrder = Doc<"orders"> & {
  order_items: ConvexOrderItem[];
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Admin view – lists every order with real-time updates.
 */
export function useConvexOrders() {
  const ordersRaw = useQuery(api.orders.listAll);
  const createMutation = useMutation(api.orders.create);
  const updateStatusMutation = useMutation(api.orders.updateStatus);
  const decrementStockAction = useAction(api.inventoryActions.decrementStock);

  const loading = ordersRaw === undefined;
  const orders: ConvexOrder[] = (ordersRaw as ConvexOrder[] | undefined) ?? [];

  /** Create an order and then decrement inventory via Supabase bridge action. */
  const createOrder = async (args: {
    merchantId: string;
    customerName: string;
    contactNumber: string;
    serviceType: "dine-in" | "pickup" | "delivery";
    address?: string;
    deliveryLatitude?: number;
    deliveryLongitude?: number;
    distanceKm?: number;
    deliveryFee?: number;
    deliveryFeeBreakdown?: Record<string, unknown>;
    deliveryMode?: "priority" | "economy";
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
      variation?: any;
      addOns?: any;
      unitPrice: number;
      quantity: number;
      subtotal: number;
    }[];
    /** Original cart items used to compute stock adjustments. */
    stockAdjustments?: { id: string; quantity: number }[];
  }) => {
    const { stockAdjustments, ...mutationArgs } = args;

    const orderId = await createMutation(mutationArgs);

    // Best-effort inventory decrement via Supabase bridge
    if (stockAdjustments && stockAdjustments.length > 0) {
      try {
        await decrementStockAction({ items: stockAdjustments });
      } catch (err) {
        console.error("Failed to decrement stock:", err);
      }
    }

    return orderId;
  };

  /** Update the status of an order. */
  const updateOrderStatus = async (
    orderId: Id<"orders">,
    status: "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled"
  ) => {
    await updateStatusMutation({ orderId, status });
  };

  return { orders, loading, createOrder, updateOrderStatus };
}

/**
 * Staff / merchant view – lists orders for a single merchant.
 */
export function useConvexOrdersByMerchant(merchantId: string | null) {
  const ordersRaw = useQuery(
    api.orders.listByMerchant,
    merchantId ? { merchantId } : "skip"
  ) ?? [];
  const updateStatusMutation = useMutation(api.orders.updateStatus);

  const loading = ordersRaw === undefined;
  const orders: ConvexOrder[] = (ordersRaw as ConvexOrder[] | undefined) ?? [];

  const updateOrderStatus = async (
    orderId: Id<"orders">,
    status: "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled"
  ) => {
    await updateStatusMutation({ orderId, status });
  };

  return { orders, loading, updateOrderStatus };
}

/**
 * Multi-merchant staff view – lists orders for multiple merchants or all.
 */
export function useConvexOrdersByMerchants(merchantIds: string[] | null, allMerchants: boolean) {
  const allOrders = useQuery(
    api.orders.listAll,
    allMerchants ? {} : "skip"
  );
  const merchantOrders = useQuery(
    api.orders.listByMerchants,
    !allMerchants && merchantIds && merchantIds.length > 0
      ? { merchantIds }
      : "skip"
  );
  const updateStatusMutation = useMutation(api.orders.updateStatus);

  const ordersRaw = allMerchants ? allOrders : merchantOrders;
  const loading = ordersRaw === undefined;
  const orders: ConvexOrder[] = (ordersRaw as ConvexOrder[] | undefined) ?? [];

  const updateOrderStatus = async (
    orderId: Id<"orders">,
    status: "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled"
  ) => {
    await updateStatusMutation({ orderId, status });
  };

  return { orders, loading, updateOrderStatus };
}

/**
 * Customer tracking – fetches a single order by its Convex ID.
 */
export function useConvexOrderById(orderId: string | null) {
  const orderRaw = useQuery(
    api.orders.getById,
    orderId ? { orderId: orderId as Id<"orders"> } : "skip"
  );

  const loading = orderRaw === undefined;
  const order = (orderRaw as ConvexOrder | null | undefined) ?? null;

  return { order, loading };
}
