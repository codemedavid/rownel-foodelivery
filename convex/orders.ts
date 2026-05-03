import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin, requireAuth, requireStaff, requireStaffForMerchant } from "./authz";
import { DEFAULTS } from "./dispatchSettings";

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

// Create a new order with items — public (customers order without an account)
export const create = mutation({
  args: {
    merchantId: v.string(),
    customerName: v.string(),
    contactNumber: v.string(),
    serviceType: v.union(
      v.literal("dine-in"),
      v.literal("pickup"),
      v.literal("delivery")
    ),
    address: v.optional(v.string()),
    deliveryLatitude: v.optional(v.float64()),
    deliveryLongitude: v.optional(v.float64()),
    merchantLatitude: v.optional(v.float64()),
    merchantLongitude: v.optional(v.float64()),
    distanceKm: v.optional(v.float64()),
    deliveryFee: v.optional(v.float64()),
    deliveryFeeBreakdown: v.optional(v.any()),
    deliveryMode: v.optional(v.union(v.literal("priority"), v.literal("economy"))),
    pickupTime: v.optional(v.string()),
    partySize: v.optional(v.float64()),
    dineInTime: v.optional(v.string()),
    paymentMethod: v.string(),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    total: v.float64(),
    ipAddress: v.optional(v.string()),
    receiptUrl: v.optional(v.string()),
    items: v.array(
      v.object({
        itemId: v.string(),
        name: v.string(),
        variation: v.optional(v.any()),
        addOns: v.optional(v.any()),
        unitPrice: v.float64(),
        quantity: v.float64(),
        subtotal: v.float64(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Validate delivery fee is non-negative
    if ((args.deliveryFee ?? 0) < 0) throw new Error("Invalid delivery fee");

    // Validate each item's price integrity
    for (const item of args.items) {
      if (item.unitPrice <= 0) throw new Error("Invalid item price");
      if (item.quantity <= 0) throw new Error("Invalid item quantity");
      const expectedSubtotal = Math.round(item.unitPrice * item.quantity * 100) / 100;
      const actualSubtotal = Math.round(item.subtotal * 100) / 100;
      if (Math.abs(expectedSubtotal - actualSubtotal) > 0.01) {
        throw new Error("Price calculation mismatch in order items");
      }
    }

    // Validate overall total is consistent with line items + delivery fee
    const itemsTotal = args.items.reduce((sum, item) => sum + item.subtotal, 0);
    const expectedTotal = Math.round((itemsTotal + (args.deliveryFee ?? 0)) * 100) / 100;
    const submittedTotal = Math.round(args.total * 100) / 100;
    if (Math.abs(submittedTotal - expectedTotal) > 0.01) {
      throw new Error("Order total does not match item subtotals plus delivery fee");
    }

    const { items, ...orderData } = args;

    const orderId = await ctx.db.insert("orders", {
      ...orderData,
      status: "pending",
    });

    for (const item of items) {
      await ctx.db.insert("orderItems", {
        orderId,
        ...item,
      });
    }

    if (
      orderData.serviceType === "delivery" &&
      orderData.merchantLatitude != null &&
      orderData.merchantLongitude != null
    ) {
      const settings = await ctx.db
        .query("dispatchSettings")
        .withIndex("by_key", (q) => q.eq("key", "global"))
        .first();
      const dispatchOnCreate = settings?.dispatchOnCreate ?? true;
      if (dispatchOnCreate) {
        await ctx.scheduler.runAfter(0, internal.offers.dispatchForOrder, {
          orderId,
        });
      }
    }

    return orderId;
  },
});

// Update order status — requires authenticated staff with access to the merchant
export const updateStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const { identity } = await requireStaffForMerchant(ctx, order.merchantId);

    await ctx.db.patch(args.orderId, {
      status: args.status,
      staffId: identity.subject,
    });

    // Kick off rider auto-assignment when a delivery order is ready.
    if (
      args.status === "ready" &&
      order.serviceType === "delivery" &&
      !order.assignedRiderId
    ) {
      await ctx.scheduler.runAfter(0, internal.offers.dispatchForOrder, {
        orderId: args.orderId,
      });
    }
  },
});

// Rider marks they've picked up the order from the merchant.
export const markPickedUp = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.assignedRiderId !== identity.subject) {
      throw new Error("Not your delivery");
    }
    if (order.status !== "ready") {
      throw new Error("Order is not ready for pickup");
    }
    await ctx.db.patch(args.orderId, {
      status: "out_for_delivery",
      pickedUpAt: Date.now(),
    });
  },
});

// Rider marks the order as delivered.
export const markDelivered = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.assignedRiderId !== identity.subject) {
      throw new Error("Not your delivery");
    }
    if (order.status !== "out_for_delivery") {
      throw new Error("Order is not out for delivery");
    }
    await ctx.db.patch(args.orderId, {
      status: "completed",
      deliveredAt: Date.now(),
    });

    // If the rider was marked busy (at max capacity), free them up now that
    // they've completed an order and dropped below the cap.
    const settingsRow = await ctx.db
      .query("dispatchSettings")
      .withIndex("by_key", (q: any) => q.eq("key", "global"))
      .first();
    const maxOrders =
      settingsRow?.maxConcurrentOrdersPerRider ?? DEFAULTS.maxConcurrentOrdersPerRider;

    const allOrders = await ctx.db
      .query("orders")
      .withIndex("by_assigned_rider", (q) => q.eq("assignedRiderId", identity.subject))
      .collect();
    const remaining = allOrders.filter(
      (o) => o._id !== args.orderId && o.status !== "completed" && o.status !== "cancelled"
    );

    if (remaining.length < maxOrders) {
      const presence = await ctx.db
        .query("riderPresence")
        .withIndex("by_supabase_user", (q) => q.eq("supabaseUserId", identity.subject))
        .first();
      if (presence && presence.status === "busy") {
        await ctx.db.patch(presence._id, { status: "available" });
      }
    }
  },
});

// Public — fetch active deliveries assigned to a rider (read-only summary
// used by customers to see ETA context). Strips PII.
export const publicAssignedRiderSummary = query({
  args: { riderId: v.string() },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_assigned_rider", (q) => q.eq("assignedRiderId", args.riderId))
      .collect();
    const active = orders.filter(
      (o) => o.status === "ready" || o.status === "out_for_delivery"
    );
    return { activeDeliveries: active.length };
  },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

// All orders with items — admin only
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const orders = await ctx.db
      .query("orders")
      .order("desc")
      .collect();

    return Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        return { ...order, order_items: items };
      })
    );
  },
});

// Orders for a specific merchant — staff only
export const listByMerchant = query({
  args: { merchantId: v.string() },
  handler: async (ctx, args) => {
    await requireStaffForMerchant(ctx, args.merchantId);

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_merchant", (q) => q.eq("merchantId", args.merchantId))
      .order("desc")
      .collect();

    return Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        return { ...order, order_items: items };
      })
    );
  },
});

// Orders for multiple merchants — staff only (checks each merchant)
export const listByMerchants = query({
  args: { merchantIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { staff } = await requireStaff(ctx);

    // Verify caller has access to every requested merchant
    if (!staff.allMerchants) {
      const allowedIds: string[] = staff.merchantIds ?? (staff.merchantId ? [staff.merchantId] : []);
      for (const mid of args.merchantIds) {
        if (!allowedIds.includes(mid)) throw new Error("Unauthorized: No access to merchant " + mid);
      }
    }

    const orderArrays = await Promise.all(
      args.merchantIds.map((merchantId) =>
        ctx.db
          .query("orders")
          .withIndex("by_merchant", (q) => q.eq("merchantId", merchantId))
          .order("desc")
          .collect()
      )
    );

    const allOrders = orderArrays.flat().sort((a, b) => b._creationTime - a._creationTime);

    return Promise.all(
      allOrders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        return { ...order, order_items: items };
      })
    );
  },
});

// Single order by ID — public customer tracking
export const getById = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    return { ...order, order_items: items };
  },
});

// Export completed orders — admin only
export const exportCompleted = query({
  args: {
    merchantId: v.optional(v.string()),
    from: v.optional(v.float64()),
    to: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    if (args.merchantId) {
      await requireStaffForMerchant(ctx, args.merchantId);
    } else {
      await requireAdmin(ctx);
    }

    let ordersQuery;
    if (args.merchantId) {
      ordersQuery = ctx.db
        .query("orders")
        .withIndex("by_merchant_and_status", (q) =>
          q.eq("merchantId", args.merchantId!).eq("status", "completed")
        );
    } else {
      ordersQuery = ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", "completed"));
    }

    let orders = await ordersQuery.order("desc").collect();

    if (args.from) orders = orders.filter((o) => o._creationTime >= args.from!);
    if (args.to) orders = orders.filter((o) => o._creationTime <= args.to!);

    return Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        return { ...order, order_items: items };
      })
    );
  },
});

// Orders by contact number — public customer self-lookup.
// GPS coordinates and IP address are stripped to limit PII exposure.
export const listByContactNumber = query({
  args: { contactNumber: v.string() },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_contact_number", (q) => q.eq("contactNumber", args.contactNumber))
      .order("desc")
      .collect();

    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        return { ...order, order_items: items };
      })
    );

    // Strip precise location and metadata before returning to unauthenticated callers
    return ordersWithItems.map(({ deliveryLatitude, deliveryLongitude, ipAddress, ...safeOrder }) => safeOrder);
  },
});
