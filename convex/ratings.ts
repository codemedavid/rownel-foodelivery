import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Customer submits a rating after delivery completion.
// Auth: contact number must match the order's contact number.
export const submit = mutation({
  args: {
    orderId: v.id("orders"),
    contactNumber: v.string(),
    rating: v.float64(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.rating < 1 || args.rating > 5) throw new Error("Invalid rating");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.contactNumber !== args.contactNumber) {
      throw new Error("Contact number does not match");
    }
    if (order.status !== "completed") {
      throw new Error("Order not delivered yet");
    }
    if (!order.assignedRiderId) {
      throw new Error("No rider to rate");
    }

    const existing = await ctx.db
      .query("riderRatings")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .first();
    if (existing) throw new Error("Already rated");

    await ctx.db.insert("riderRatings", {
      orderId: args.orderId,
      riderId: order.assignedRiderId,
      customerContact: args.contactNumber,
      rating: args.rating,
      comment: args.comment,
    });

    // Note: aggregate rating cache in Supabase is updated by the client
    // (or a follow-up admin sync) since Convex mutations cannot fetch Supabase.
  },
});

export const getForOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("riderRatings")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .first();
  },
});

export const listForRider = query({
  args: { riderId: v.string(), limit: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    return ctx.db
      .query("riderRatings")
      .withIndex("by_rider", (q) => q.eq("riderId", args.riderId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// Aggregate stats — used by admin dashboard.
export const statsForRider = query({
  args: { riderId: v.string() },
  handler: async (ctx, args) => {
    const ratings = await ctx.db
      .query("riderRatings")
      .withIndex("by_rider", (q) => q.eq("riderId", args.riderId))
      .collect();
    if (ratings.length === 0) return { count: 0, average: 0 };
    const sum = ratings.reduce((s, r) => s + r.rating, 0);
    return { count: ratings.length, average: sum / ratings.length };
  },
});
