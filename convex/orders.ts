import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Create a new order with items
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

    return orderId;
  },
});

// Get all orders with items (admin view)
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db
      .query("orders")
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

    return ordersWithItems;
  },
});

// Get orders for a specific merchant (staff view)
export const listByMerchant = query({
  args: { merchantId: v.string() },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_merchant", (q) => q.eq("merchantId", args.merchantId))
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

    return ordersWithItems;
  },
});

// Get orders for multiple merchants (multi-merchant staff view)
export const listByMerchants = query({
  args: { merchantIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const orderArrays = await Promise.all(
      args.merchantIds.map((merchantId) =>
        ctx.db
          .query("orders")
          .withIndex("by_merchant", (q) => q.eq("merchantId", merchantId))
          .order("desc")
          .collect()
      )
    );

    // Merge and sort by creation time descending
    const allOrders = orderArrays.flat().sort((a, b) => b._creationTime - a._creationTime);

    const ordersWithItems = await Promise.all(
      allOrders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        return { ...order, order_items: items };
      })
    );

    return ordersWithItems;
  },
});

// Get a single order by ID (customer tracking)
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

// Export completed orders data (for CSV export)
export const exportCompleted = query({
  args: {
    merchantId: v.optional(v.string()),
    from: v.optional(v.float64()),
    to: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
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

    // Apply date range filters
    if (args.from) {
      orders = orders.filter((o) => o._creationTime >= args.from!);
    }
    if (args.to) {
      orders = orders.filter((o) => o._creationTime <= args.to!);
    }

    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        return { ...order, order_items: items };
      })
    );

    return ordersWithItems;
  },
});

// Update order status
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
    staffId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, {
      status: args.status,
      staffId: args.staffId,
    });
  },
});
