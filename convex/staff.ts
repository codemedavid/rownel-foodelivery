import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const create = mutation({
  args: {
    supabaseUserId: v.string(),
    email: v.string(),
    name: v.string(),
    merchantIds: v.array(v.string()),
    allMerchants: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { merchantIds, allMerchants, ...rest } = args;
    const staffId = await ctx.db.insert("staff", {
      ...rest,
      merchantIds,
      allMerchants: allMerchants ?? false,
      isActive: true,
      createdAt: Date.now(),
    });
    return staffId;
  },
});

export const update = mutation({
  args: {
    staffId: v.id("staff"),
    merchantIds: v.optional(v.array(v.string())),
    allMerchants: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { staffId, ...patch } = args;
    await ctx.db.patch(staffId, patch);
  },
});

export const listByMerchant = query({
  args: { merchantId: v.string() },
  handler: async (ctx, args) => {
    const allStaff = await ctx.db.query("staff").collect();
    return allStaff.filter((s) => {
      if (s.allMerchants) return true;
      const ids = s.merchantIds ?? (s.merchantId ? [s.merchantId] : []);
      return ids.includes(args.merchantId);
    });
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("staff").collect();
  },
});

export const getBySupabaseUser = query({
  args: { supabaseUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("staff")
      .withIndex("by_supabase_user", (q) =>
        q.eq("supabaseUserId", args.supabaseUserId)
      )
      .first();
  },
});

export const deactivate = mutation({
  args: { staffId: v.id("staff") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.staffId, { isActive: false });
  },
});

export const activate = mutation({
  args: { staffId: v.id("staff") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.staffId, { isActive: true });
  },
});
