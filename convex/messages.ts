import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const MAX_TEXT_LEN = 1000;

// Customer sends without auth (verified by matching order.contactNumber).
// Rider sends with auth (must be order.assignedRiderId).
export const send = mutation({
  args: {
    orderId: v.id("orders"),
    senderType: v.union(v.literal("customer"), v.literal("rider")),
    contactNumber: v.optional(v.string()),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (!text) throw new Error("Message is empty");
    if (text.length > MAX_TEXT_LEN) throw new Error("Message too long");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (!order.assignedRiderId) throw new Error("No rider assigned yet");

    let senderId: string;

    if (args.senderType === "rider") {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Unauthorized");
      if (order.assignedRiderId !== identity.subject) {
        throw new Error("Not your delivery");
      }
      senderId = identity.subject;
    } else {
      if (!args.contactNumber) throw new Error("Contact number required");
      if (order.contactNumber !== args.contactNumber) {
        throw new Error("Contact number does not match");
      }
      senderId = args.contactNumber;
    }

    await ctx.db.insert("orderMessages", {
      orderId: args.orderId,
      senderType: args.senderType,
      senderId,
      text,
    });
  },
});

// Customer reads via contactNumber match; rider reads with auth.
export const listByOrder = query({
  args: {
    orderId: v.id("orders"),
    contactNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return [];

    const identity = await ctx.auth.getUserIdentity();
    const isRider =
      identity != null && order.assignedRiderId === identity.subject;
    const isCustomer =
      args.contactNumber != null && order.contactNumber === args.contactNumber;

    if (!isRider && !isCustomer) return [];

    return ctx.db
      .query("orderMessages")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .order("asc")
      .collect();
  },
});

export const unreadCountForRider = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const activeOrders = await ctx.db
      .query("orders")
      .withIndex("by_assigned_rider", (q) =>
        q.eq("assignedRiderId", identity.subject)
      )
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "ready"),
          q.eq(q.field("status"), "out_for_delivery")
        )
      )
      .collect();
    let total = 0;
    for (const order of activeOrders) {
      const msgs = await ctx.db
        .query("orderMessages")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();
      total += msgs.filter((m) => m.senderType === "customer" && !m.readAt).length;
    }
    return total;
  },
});

export const markRead = mutation({
  args: {
    orderId: v.id("orders"),
    contactNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return;
    const identity = await ctx.auth.getUserIdentity();
    const isRider =
      identity != null && order.assignedRiderId === identity.subject;
    const isCustomer =
      args.contactNumber != null && order.contactNumber === args.contactNumber;
    if (!isRider && !isCustomer) return;

    const readerType = isRider ? "rider" : "customer";
    const messages = await ctx.db
      .query("orderMessages")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    const now = Date.now();
    for (const m of messages) {
      // Mark unread messages from the other party as read.
      if (m.senderType !== readerType && !m.readAt) {
        await ctx.db.patch(m._id, { readAt: now });
      }
    }
  },
});
