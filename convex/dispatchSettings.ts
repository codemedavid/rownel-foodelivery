import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
import { requireAdmin } from "./authz";

export const DEFAULTS = {
  offerRadiusKm: 5,
  offerExpiryMs: 30_000,
  maxConcurrentOffers: 3,
  locationStaleMs: 120_000,
  dispatchOnCreate: true,
  maxConcurrentOrdersPerRider: 3,
  batchTimeWindowMs: 600_000,
  batchProximityKm: 2.0,
};

const SINGLETON_KEY = "global";

async function readRow(ctx: any) {
  return ctx.db
    .query("dispatchSettings")
    .withIndex("by_key", (q: any) => q.eq("key", SINGLETON_KEY))
    .first();
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await readRow(ctx);
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
  },
});

export const getInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await readRow(ctx);
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
  },
});

export const update = mutation({
  args: {
    offerRadiusKm: v.float64(),
    offerExpiryMs: v.float64(),
    maxConcurrentOffers: v.float64(),
    locationStaleMs: v.float64(),
    dispatchOnCreate: v.boolean(),
    maxConcurrentOrdersPerRider: v.float64(),
    batchTimeWindowMs: v.float64(),
    batchProximityKm: v.float64(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    if (args.offerRadiusKm <= 0 || args.offerRadiusKm > 100) {
      throw new Error("Radius must be between 0 and 100 km");
    }
    if (args.offerExpiryMs < 5_000 || args.offerExpiryMs > 600_000) {
      throw new Error("Offer expiry must be between 5s and 10min");
    }
    if (args.maxConcurrentOffers < 1 || args.maxConcurrentOffers > 20) {
      throw new Error("Max concurrent offers must be between 1 and 20");
    }
    if (args.locationStaleMs < 30_000 || args.locationStaleMs > 30 * 60_000) {
      throw new Error("Location staleness must be between 30s and 30min");
    }
    if (args.maxConcurrentOrdersPerRider < 1 || args.maxConcurrentOrdersPerRider > 10) {
      throw new Error("Max concurrent orders per rider must be between 1 and 10");
    }
    if (args.batchTimeWindowMs < 60_000 || args.batchTimeWindowMs > 30 * 60_000) {
      throw new Error("Batch time window must be between 1 min and 30 min");
    }
    if (args.batchProximityKm <= 0 || args.batchProximityKm > 20) {
      throw new Error("Batch proximity must be between 0 and 20 km");
    }

    const row = await readRow(ctx);
    const now = Date.now();
    if (row) {
      await ctx.db.patch(row._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("dispatchSettings", {
        key: SINGLETON_KEY,
        ...args,
        updatedAt: now,
      });
    }
  },
});
