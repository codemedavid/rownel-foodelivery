import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const create = mutation({
  args: {
    supabaseUserId: v.string(),
    email: v.string(),
    name: v.string(),
    merchantId: v.string(),
  },
  handler: async (ctx, args) => {
    const staffId = await ctx.db.insert("staff", {
      ...args,
      isActive: true,
    });
    return staffId;
  },
});

export const listByMerchant = query({
  args: { merchantId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("staff")
      .withIndex("by_merchant", (q) => q.eq("merchantId", args.merchantId))
      .collect();
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
