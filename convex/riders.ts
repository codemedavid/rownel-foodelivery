import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdmin, requireAuth } from "./authz";

async function getOrCreatePresence(ctx: any, supabaseUserId: string) {
  const existing = await ctx.db
    .query("riderPresence")
    .withIndex("by_supabase_user", (q: any) => q.eq("supabaseUserId", supabaseUserId))
    .first();
  if (existing) return existing;
  const id = await ctx.db.insert("riderPresence", {
    supabaseUserId,
    status: "offline",
    locationPermission: "unknown",
  });
  return ctx.db.get(id);
}

// ---------------------------------------------------------------------------
// Rider mutations
// ---------------------------------------------------------------------------

export const updateLocation = mutation({
  args: {
    latitude: v.float64(),
    longitude: v.float64(),
  },
  handler: async (ctx, args) => {
    // Silently no-op when unauthenticated — the geolocation watcher can fire
    // a beat before/after a Supabase token refresh and we don't want a sea of
    // "Unauthorized" errors in the rider's console during normal token churn.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const presence = await getOrCreatePresence(ctx, identity.subject);
    await ctx.db.patch(presence._id, {
      currentLatitude: args.latitude,
      currentLongitude: args.longitude,
      lastLocationUpdate: Date.now(),
      locationPermission: "granted",
    });
  },
});

export const setLocationPermission = mutation({
  args: {
    permission: v.union(
      v.literal("granted"),
      v.literal("denied"),
      v.literal("unknown")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const presence = await getOrCreatePresence(ctx, identity.subject);
    const patch: any = { locationPermission: args.permission };
    if (args.permission === "denied" && presence.status !== "offline") {
      patch.status = "offline";
    }
    await ctx.db.patch(presence._id, patch);
  },
});

export const setOnline = mutation({
  args: {
    online: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const presence = await getOrCreatePresence(ctx, identity.subject);

    if (!args.online) {
      await ctx.db.patch(presence._id, { status: "offline" });
      return;
    }

    if (presence.locationPermission !== "granted") {
      throw new Error("Enable location access before going online");
    }
    if (
      !presence.lastLocationUpdate ||
      Date.now() - presence.lastLocationUpdate > 120_000
    ) {
      throw new Error("Location not detected — share your current location");
    }
    await ctx.db.patch(presence._id, { status: "available" });
  },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const myPresence = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return ctx.db
      .query("riderPresence")
      .withIndex("by_supabase_user", (q) => q.eq("supabaseUserId", identity.subject))
      .first();
  },
});

// All riders' presence — admin/staff dashboard view.
export const listAvailable = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return ctx.db
      .query("riderPresence")
      .withIndex("by_status", (q) => q.eq("status", "available"))
      .collect();
  },
});

// Public — returns lat/lng of available riders (no PII) for the customer "finding rider" map.
export const listAvailableLocations = query({
  args: {},
  handler: async (ctx) => {
    const riders = await ctx.db
      .query("riderPresence")
      .withIndex("by_status", (q) => q.eq("status", "available"))
      .collect();
    return riders
      .filter((r) => r.currentLatitude != null && r.currentLongitude != null)
      .map((r) => ({
        id: r.supabaseUserId,
        latitude: r.currentLatitude as number,
        longitude: r.currentLongitude as number,
      }));
  },
});

// Public — fetch presence for a rider so customers can see live location.
export const getPresenceById = query({
  args: { supabaseUserId: v.string() },
  handler: async (ctx, args) => {
    const presence = await ctx.db
      .query("riderPresence")
      .withIndex("by_supabase_user", (q) => q.eq("supabaseUserId", args.supabaseUserId))
      .first();
    if (!presence) return null;
    return {
      status: presence.status,
      lastLocationUpdate: presence.lastLocationUpdate,
      currentLatitude: presence.currentLatitude ?? null,
      currentLongitude: presence.currentLongitude ?? null,
    };
  },
});

// Active orders assigned to the calling rider.
export const myActiveOrders = query({
  args: {},
  handler: async (ctx) => {
    // Treat "no identity yet" as a loading state, not an error. Convex's auth
    // handshake can briefly trail Supabase on first paint and during token
    // refreshes; throwing here would crash the rider dashboard.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_assigned_rider", (q) => q.eq("assignedRiderId", identity.subject))
      .order("desc")
      .collect();
    const active = orders.filter(
      (o) => o.status !== "completed" && o.status !== "cancelled"
    );
    return Promise.all(
      active.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        return { ...order, order_items: items };
      })
    );
  },
});

// Completed orders for earnings history.
export const myDeliveryHistory = query({
  args: { limit: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_assigned_rider", (q) => q.eq("assignedRiderId", identity.subject))
      .order("desc")
      .take(args.limit ?? 50);
    return orders.filter((o) => o.status === "completed");
  },
});

// Admin: mark rider offline (e.g., manual override).
export const adminSetOffline = mutation({
  args: { supabaseUserId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const presence = await ctx.db
      .query("riderPresence")
      .withIndex("by_supabase_user", (q) => q.eq("supabaseUserId", args.supabaseUserId))
      .first();
    if (presence) await ctx.db.patch(presence._id, { status: "offline" });
  },
});
