import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { DEFAULTS } from "./dispatchSettings";
import { canBatchForRider } from "./batching";

async function readDispatchSettings(ctx: any) {
  const row = await ctx.db
    .query("dispatchSettings")
    .withIndex("by_key", (q: any) => q.eq("key", "global"))
    .first();
  return {
    offerRadiusKm: row?.offerRadiusKm ?? DEFAULTS.offerRadiusKm,
    offerExpiryMs: row?.offerExpiryMs ?? DEFAULTS.offerExpiryMs,
    maxConcurrentOffers: row?.maxConcurrentOffers ?? DEFAULTS.maxConcurrentOffers,
    locationStaleMs: row?.locationStaleMs ?? DEFAULTS.locationStaleMs,
    dispatchOnCreate: row?.dispatchOnCreate ?? DEFAULTS.dispatchOnCreate,
    maxConcurrentOrdersPerRider: row?.maxConcurrentOrdersPerRider ?? DEFAULTS.maxConcurrentOrdersPerRider,
    batchTimeWindowMs: row?.batchTimeWindowMs ?? DEFAULTS.batchTimeWindowMs,
    batchProximityKm: row?.batchProximityKm ?? DEFAULTS.batchProximityKm,
  };
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function requireAuth(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");
  return identity;
}

// ---------------------------------------------------------------------------
// Dispatch offers — called when an order is ready and needs a rider.
// ---------------------------------------------------------------------------

export const dispatchForOrder = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return;
    if (order.serviceType !== "delivery") return;
    if (order.assignedRiderId) return;

    const merchantLat = order.merchantLatitude;
    const merchantLng = order.merchantLongitude;
    if (merchantLat == null || merchantLng == null) return;

    const settings = await readDispatchSettings(ctx);
    const now = Date.now();

    const available = await ctx.db
      .query("riderPresence")
      .withIndex("by_status", (q) => q.eq("status", "available"))
      .collect();

    // Riders already shown this offer (skip in re-dispatch).
    const existingOffers = await ctx.db
      .query("orderOffers")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    const skipRiderIds = new Set(existingOffers.map((o) => o.riderId));

    // Pre-filter by location freshness and radius, then run batching check per rider.
    const inRange = available
      .filter(
        (r) =>
          r.currentLatitude != null &&
          r.currentLongitude != null &&
          r.lastLocationUpdate != null &&
          now - r.lastLocationUpdate < settings.locationStaleMs &&
          !skipRiderIds.has(r.supabaseUserId)
      )
      .map((r) => ({
        riderId: r.supabaseUserId,
        distanceKm: haversineKm(
          r.currentLatitude!,
          r.currentLongitude!,
          merchantLat,
          merchantLng
        ),
      }))
      .filter((c) => c.distanceKm <= settings.offerRadiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const batchSettings = {
      maxConcurrentOrdersPerRider: settings.maxConcurrentOrdersPerRider,
      batchTimeWindowMs: settings.batchTimeWindowMs,
      batchProximityKm: settings.batchProximityKm,
    };
    const candidateOrder = {
      merchantId: order.merchantId,
      merchantLatitude: merchantLat,
      merchantLongitude: merchantLng,
      deliveryMode: order.deliveryMode ?? null,
    };

    const candidates: { riderId: string; distanceKm: number }[] = [];
    for (const c of inRange) {
      if (candidates.length >= settings.maxConcurrentOffers) break;
      const allOrders = await ctx.db
        .query("orders")
        .withIndex("by_assigned_rider", (q: any) => q.eq("assignedRiderId", c.riderId))
        .collect();
      const activeOrders = allOrders.filter(
        (o: any) => o.status !== "completed" && o.status !== "cancelled"
      );
      if (canBatchForRider(activeOrders, candidateOrder, batchSettings).ok) {
        candidates.push({ riderId: c.riderId, distanceKm: c.distanceKm });
      }
    }

    if (candidates.length === 0) {
      // Re-try in a minute if no riders nearby.
      await ctx.scheduler.runAfter(60_000, internal.offers.dispatchForOrder, {
        orderId: args.orderId,
      });
      return;
    }

    const expiresAt = now + settings.offerExpiryMs;
    for (const c of candidates) {
      await ctx.db.insert("orderOffers", {
        orderId: args.orderId,
        riderId: c.riderId,
        status: "pending",
        offeredAt: now,
        expiresAt,
        distanceKm: c.distanceKm,
      });
    }

    await ctx.scheduler.runAfter(settings.offerExpiryMs + 1000, internal.offers.expireOffers, {
      orderId: args.orderId,
    });
  },
});

export const expireOffers = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order || order.assignedRiderId) return;

    const offers = await ctx.db
      .query("orderOffers")
      .withIndex("by_order_and_status", (q) =>
        q.eq("orderId", args.orderId).eq("status", "pending")
      )
      .collect();

    const now = Date.now();
    for (const o of offers) {
      if (o.expiresAt <= now) {
        await ctx.db.patch(o._id, { status: "expired", respondedAt: now });
      }
    }

    // No active offers remain — try another round.
    if (!order.assignedRiderId) {
      await ctx.scheduler.runAfter(0, internal.offers.dispatchForOrder, {
        orderId: args.orderId,
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Rider-facing
// ---------------------------------------------------------------------------

export const listMyOffers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const offers = await ctx.db
      .query("orderOffers")
      .withIndex("by_rider_and_status", (q) =>
        q.eq("riderId", identity.subject).eq("status", "pending")
      )
      .collect();
    const now = Date.now();
    const active = offers.filter((o) => o.expiresAt > now);
    return Promise.all(
      active.map(async (offer) => {
        const order = await ctx.db.get(offer.orderId);
        return { offer, order };
      })
    );
  },
});

export const acceptOffer = mutation({
  args: { offerId: v.id("orderOffers") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const offer = await ctx.db.get(args.offerId);
    if (!offer) throw new Error("Offer not found");
    if (offer.riderId !== identity.subject) throw new Error("Not your offer");
    if (offer.status !== "pending") throw new Error("Offer no longer available");
    if (offer.expiresAt <= Date.now()) throw new Error("Offer expired");

    const order = await ctx.db.get(offer.orderId);
    if (!order) throw new Error("Order not found");
    if (order.assignedRiderId) throw new Error("Order already assigned");

    // Race-safe batching gate: re-validate at accept time in case the rider
    // accepted another order between receiving this offer and tapping Accept.
    const settings = await readDispatchSettings(ctx);
    const allOrders = await ctx.db
      .query("orders")
      .withIndex("by_assigned_rider", (q) => q.eq("assignedRiderId", identity.subject))
      .collect();
    const activeOrders = allOrders.filter(
      (o) => o.status !== "completed" && o.status !== "cancelled"
    );
    const batchCheck = canBatchForRider(
      activeOrders,
      {
        merchantId: order.merchantId,
        merchantLatitude: order.merchantLatitude ?? null,
        merchantLongitude: order.merchantLongitude ?? null,
        deliveryMode: order.deliveryMode ?? null,
      },
      {
        maxConcurrentOrdersPerRider: settings.maxConcurrentOrdersPerRider,
        batchTimeWindowMs: settings.batchTimeWindowMs,
        batchProximityKm: settings.batchProximityKm,
      }
    );
    if (!batchCheck.ok) {
      throw new Error(`Cannot accept: ${batchCheck.reason}`);
    }

    const now = Date.now();

    // Atomic: assign order, mark accepted, reject siblings.
    await ctx.db.patch(offer.orderId, {
      assignedRiderId: identity.subject,
      riderAssignedAt: now,
    });

    const siblings = await ctx.db
      .query("orderOffers")
      .withIndex("by_order_and_status", (q) =>
        q.eq("orderId", offer.orderId).eq("status", "pending")
      )
      .collect();
    for (const s of siblings) {
      if (s._id === offer._id) {
        await ctx.db.patch(s._id, { status: "accepted", respondedAt: now });
      } else {
        await ctx.db.patch(s._id, { status: "rejected", respondedAt: now });
      }
    }

    // Flip presence to "busy" once the rider is at max capacity.
    const newActiveCount = activeOrders.length + 1;
    if (newActiveCount >= settings.maxConcurrentOrdersPerRider) {
      const presence = await ctx.db
        .query("riderPresence")
        .withIndex("by_supabase_user", (q) => q.eq("supabaseUserId", identity.subject))
        .first();
      if (presence && presence.status === "available") {
        await ctx.db.patch(presence._id, { status: "busy" });
      }
    }

    return offer.orderId;
  },
});

export const rejectOffer = mutation({
  args: { offerId: v.id("orderOffers") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const offer = await ctx.db.get(args.offerId);
    if (!offer) throw new Error("Offer not found");
    if (offer.riderId !== identity.subject) throw new Error("Not your offer");
    if (offer.status !== "pending") return;
    await ctx.db.patch(args.offerId, {
      status: "rejected",
      respondedAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Public — for triggering dispatch from a public mutation hook
// (used by orders.updateStatus when status flips to "ready").
// ---------------------------------------------------------------------------

export const triggerDispatch = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    // Auth handled by caller (orders.updateStatus). Schedule the internal flow.
    await ctx.scheduler.runAfter(0, internal.offers.dispatchForOrder, {
      orderId: args.orderId,
    });
  },
});
