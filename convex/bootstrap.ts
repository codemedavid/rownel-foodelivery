import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";

// CLI-only: grant admin to an existing Supabase user. Only invocable via
// `npx convex run` (deploy-key authenticated), never from the client.
export const grantAdmin = internalMutation({
  args: {
    supabaseUserId: v.string(),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("staff")
      .withIndex("by_supabase_user", (q) =>
        q.eq("supabaseUserId", args.supabaseUserId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        allMerchants: true,
        isActive: true,
        email: args.email,
        name: args.name,
      });
      return { staffId: existing._id, updated: true };
    }

    const staffId = await ctx.db.insert("staff", {
      supabaseUserId: args.supabaseUserId,
      email: args.email,
      name: args.name,
      merchantIds: [],
      allMerchants: true,
      isActive: true,
      createdAt: Date.now(),
    });
    return { staffId, updated: false };
  },
});

// One-time bootstrap for the first admin. No-ops once any active
// allMerchants staff row exists, so it is safe to leave deployed.
export const bootstrapFirstAdmin = mutation({
  args: {
    supabaseUserId: v.string(),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existingAdmin = await ctx.db
      .query("staff")
      .filter((q) =>
        q.and(
          q.eq(q.field("allMerchants"), true),
          q.eq(q.field("isActive"), true),
        ),
      )
      .first();
    if (existingAdmin) {
      return { ok: false as const, reason: "admin_already_exists" };
    }

    const existingForUser = await ctx.db
      .query("staff")
      .withIndex("by_supabase_user", (q) =>
        q.eq("supabaseUserId", args.supabaseUserId),
      )
      .first();

    if (existingForUser) {
      await ctx.db.patch(existingForUser._id, {
        allMerchants: true,
        isActive: true,
      });
      return { ok: true as const, staffId: existingForUser._id };
    }

    const staffId = await ctx.db.insert("staff", {
      supabaseUserId: args.supabaseUserId,
      email: args.email,
      name: args.name,
      merchantIds: [],
      allMerchants: true,
      isActive: true,
      createdAt: Date.now(),
    });
    return { ok: true as const, staffId };
  },
});
