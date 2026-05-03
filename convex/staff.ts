import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdmin } from "./authz";

// ---------------------------------------------------------------------------
// Mutations — all require admin
// ---------------------------------------------------------------------------

export const create = mutation({
  args: {
    supabaseUserId: v.string(),
    email: v.string(),
    name: v.string(),
    merchantIds: v.array(v.string()),
    allMerchants: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

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
    await requireAdmin(ctx);

    const { staffId, ...patch } = args;
    await ctx.db.patch(staffId, patch);
  },
});

export const deactivate = mutation({
  args: { staffId: v.id("staff") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.staffId, { isActive: false });
  },
});

export const activate = mutation({
  args: { staffId: v.id("staff") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.staffId, { isActive: true });
  },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

// All staff — admin only
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    // Treat "no identity yet" as a loading state (return []), not an error,
    // so React doesn't crash during the brief Convex auth handshake window.
    // Real auth failures (signed in but not admin) still throw below.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    await requireAdmin(ctx);
    return ctx.db.query("staff").collect();
  },
});

// Staff for a specific merchant — requires authenticated staff
export const listByMerchant = query({
  args: { merchantId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const allStaff = await ctx.db.query("staff").collect();
    return allStaff.filter((s) => {
      if (s.allMerchants) return true;
      const ids = s.merchantIds ?? (s.merchantId ? [s.merchantId] : []);
      return ids.includes(args.merchantId);
    });
  },
});

// Caller's own staff record — only returns the record for the authenticated user
export const getBySupabaseUser = query({
  args: { supabaseUserId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // A user may only fetch their own record; admins may fetch any
    const caller = await ctx.db
      .query("staff")
      .withIndex("by_supabase_user", (q) => q.eq("supabaseUserId", identity.subject))
      .first();

    const isAdmin = caller?.isActive && caller?.allMerchants;
    if (!isAdmin && identity.subject !== args.supabaseUserId) {
      throw new Error("Unauthorized");
    }

    return ctx.db
      .query("staff")
      .withIndex("by_supabase_user", (q) => q.eq("supabaseUserId", args.supabaseUserId))
      .first();
  },
});
