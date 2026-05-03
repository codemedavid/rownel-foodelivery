import { v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { getMetadataRole, isAdminIdentity } from "./authz";

// Internal: verify the caller is an admin.
export const _verifyAdmin = internalQuery({
  args: {
    supabaseUserId: v.string(),
    email: v.optional(v.string()),
    appMetadataRole: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await ctx.db
      .query("staff")
      .withIndex("by_supabase_user", (q) => q.eq("supabaseUserId", args.supabaseUserId))
      .first();
    return isAdminIdentity({
      identity: {
        subject: args.supabaseUserId,
        email: args.email,
        app_metadata: args.appMetadataRole ? { role: args.appMetadataRole } : undefined,
      },
      staff,
    });
  },
});

// fetch with an abort timeout so the action never hangs and triggers
// "Connection lost while action was in flight" on the client.
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`Supabase request timed out after ${timeoutMs}ms (${url})`);
    }
    throw new Error(`Network error contacting Supabase: ${err?.message ?? err}`);
  } finally {
    clearTimeout(timer);
  }
}

// Admin-only: create a rider account end-to-end via Supabase Admin API.
// Sets app_metadata.role='rider' (non-forgeable) and inserts into riders table
// pre-approved.
export const adminCreateRider = action({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    phone: v.string(),
    plateNumber: v.string(),
    vehicleType: v.union(
      v.literal("motorcycle"),
      v.literal("bicycle"),
      v.literal("car")
    ),
    paymentMode: v.optional(v.union(v.literal("fixed"), v.literal("percentage"))),
    paymentValue: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized: not signed in");

    const isAdmin: boolean = await ctx.runQuery(internal.riderActions._verifyAdmin, {
      supabaseUserId: identity.subject,
      email: identity.email,
      appMetadataRole: getMetadataRole(identity as any) ?? undefined,
    });
    if (!isAdmin) throw new Error("Unauthorized: Admin access required");

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      throw new Error(
        "Server not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Convex env (`npx convex env set ...`)"
      );
    }

    // 1. Create auth user with role baked into app_metadata.
    const createUserRes = await fetchWithTimeout(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        email: args.email,
        password: args.password,
        email_confirm: true,
        app_metadata: { role: "rider" },
        user_metadata: { name: args.name, role: "rider" },
      }),
    });

    if (!createUserRes.ok) {
      const errText = await createUserRes.text().catch(() => "");
      throw new Error(
        `Failed to create auth user (HTTP ${createUserRes.status}): ${errText || createUserRes.statusText}`
      );
    }
    const created = await createUserRes.json();
    const userId: string = created.id ?? created.user?.id;
    if (!userId) throw new Error("Auth user created but no id returned");

    // 2. Insert rider profile (pre-approved since admin-created).
    const insertRes = await fetchWithTimeout(`${supabaseUrl}/rest/v1/riders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        id: userId,
        name: args.name,
        phone: args.phone,
        plate_number: args.plateNumber,
        vehicle_type: args.vehicleType,
        is_approved: true,
        is_active: true,
        payment_mode: args.paymentMode ?? null,
        payment_value: args.paymentValue ?? null,
      }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text().catch(() => "");
      // Best-effort cleanup of the auth user so retries don't collide on email.
      await fetchWithTimeout(
        `${supabaseUrl}/auth/v1/admin/users/${userId}`,
        {
          method: "DELETE",
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        },
        8000
      ).catch(() => {});
      throw new Error(
        `Failed to insert rider profile (HTTP ${insertRes.status}): ${errText || insertRes.statusText}`
      );
    }

    return { userId };
  },
});

// Admin-only: promote an existing pending rider's app_metadata to role=rider.
// Use this on the existing approve flow to make the role tamper-proof.
export const adminSetRiderRole = action({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const isAdmin: boolean = await ctx.runQuery(internal.riderActions._verifyAdmin, {
      supabaseUserId: identity.subject,
      email: identity.email,
      appMetadataRole: getMetadataRole(identity as any) ?? undefined,
    });
    if (!isAdmin) throw new Error("Unauthorized: Admin access required");

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Server not configured");
    }

    const res = await fetchWithTimeout(`${supabaseUrl}/auth/v1/admin/users/${args.userId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ app_metadata: { role: "rider" } }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `Failed to update auth user (HTTP ${res.status}): ${errText || res.statusText}`
      );
    }
  },
});
