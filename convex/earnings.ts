import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdmin, requireAuth } from "./authz";

// ---------------------------------------------------------------------------
// Admin queries
// ---------------------------------------------------------------------------

export const adminRiderOrders = query({
  args: {
    riderId: v.string(),
    from: v.optional(v.float64()),
    to: v.optional(v.float64()),
    unpaidOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    let orders = await ctx.db
      .query("orders")
      .withIndex("by_assigned_rider", (q) => q.eq("assignedRiderId", args.riderId))
      .order("desc")
      .collect();

    orders = orders.filter((o) => o.status === "completed");
    if (args.from) orders = orders.filter((o) => o._creationTime >= args.from!);
    if (args.to) orders = orders.filter((o) => o._creationTime <= args.to!);
    if (args.unpaidOnly) orders = orders.filter((o) => !o.payoutId);

    return orders;
  },
});

export const adminListPayouts = query({
  args: { riderId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.riderId) {
      return ctx.db
        .query("payouts")
        .withIndex("by_rider", (q) => q.eq("riderId", args.riderId!))
        .order("desc")
        .collect();
    }
    return ctx.db.query("payouts").order("desc").collect();
  },
});

// ---------------------------------------------------------------------------
// Admin mutations
// ---------------------------------------------------------------------------

export const adminCreatePayout = mutation({
  args: {
    riderId: v.string(),
    amount: v.float64(),
    notes: v.optional(v.string()),
    periodFrom: v.optional(v.float64()),
    periodTo: v.optional(v.float64()),
    orderIds: v.array(v.id("orders")),
    orderEarnings: v.array(
      v.object({ orderId: v.id("orders"), earning: v.float64() })
    ),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireAdmin(ctx);
    const now = Date.now();

    const payoutId = await ctx.db.insert("payouts", {
      riderId: args.riderId,
      amount: args.amount,
      status: "pending",
      notes: args.notes,
      periodFrom: args.periodFrom,
      periodTo: args.periodTo,
      orderIds: args.orderIds.map(String),
      createdAt: now,
      createdBy: identity.subject,
    });

    for (const orderId of args.orderIds) {
      const earning = args.orderEarnings.find((e) => e.orderId === orderId)?.earning;
      await ctx.db.patch(orderId, {
        payoutId,
        ...(earning !== undefined ? { riderEarning: earning } : {}),
      });
    }

    return payoutId;
  },
});

export const adminMarkPaid = mutation({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new Error("Payout not found");
    if (payout.status === "paid") throw new Error("Already marked as paid");
    await ctx.db.patch(args.payoutId, { status: "paid", paidAt: Date.now() });
  },
});

export const adminCancelPayout = mutation({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new Error("Payout not found");
    if (payout.status === "paid") throw new Error("Cannot cancel a paid payout");

    if (payout.orderIds?.length) {
      for (const rawId of payout.orderIds) {
        const order = await ctx.db.get(rawId as any);
        if (order) await ctx.db.patch(order._id, { payoutId: undefined });
      }
    }

    await ctx.db.patch(args.payoutId, { status: "cancelled" });
  },
});

// ---------------------------------------------------------------------------
// Rider queries
// ---------------------------------------------------------------------------

export const myEarningsSummary = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const allOrders = await ctx.db
      .query("orders")
      .withIndex("by_assigned_rider", (q) => q.eq("assignedRiderId", identity.subject))
      .collect();

    const completed = allOrders.filter((o) => o.status === "completed");
    const totalEarned = completed.reduce((sum, o) => sum + (o.riderEarning ?? 0), 0);

    const payouts = await ctx.db
      .query("payouts")
      .withIndex("by_rider", (q) => q.eq("riderId", identity.subject))
      .order("desc")
      .collect();

    const totalPaid = payouts
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + p.amount, 0);

    const pendingPayout = payouts
      .filter((p) => p.status === "pending")
      .reduce((sum, p) => sum + p.amount, 0);

    const unpaidOrders = completed.filter((o) => !o.payoutId && (o.riderEarning ?? 0) > 0);
    const unpaidEarnings = unpaidOrders.reduce((sum, o) => sum + (o.riderEarning ?? 0), 0);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayOrders = completed.filter(
      (o) => (o.deliveredAt ?? o._creationTime) >= todayStart.getTime()
    );
    const todayEarnings = todayOrders.reduce((sum, o) => sum + (o.riderEarning ?? 0), 0);

    return {
      totalEarned,
      totalPaid,
      pendingPayout,
      unpaidEarnings,
      todayEarnings,
      completedCount: completed.length,
      todayCount: todayOrders.length,
    };
  },
});

export const myPayouts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return ctx.db
      .query("payouts")
      .withIndex("by_rider", (q) => q.eq("riderId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const myRecentDeliveries = query({
  args: { limit: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_assigned_rider", (q) => q.eq("assignedRiderId", identity.subject))
      .order("desc")
      .take(args.limit ?? 30);
    return orders.filter((o) => o.status === "completed");
  },
});
