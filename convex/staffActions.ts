import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getMetadataRole } from "./authz";

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

// Admin-only: create a staff account end-to-end via Supabase Admin API.
// Sets app_metadata.role='staff' (non-forgeable) and inserts Convex staff record.
export const adminCreateStaff = action({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    merchantIds: v.array(v.string()),
    allMerchants: v.optional(v.boolean()),
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
        "Server not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Convex env"
      );
    }

    // 1. Create auth user with app_metadata.role='staff' (tamper-proof).
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
        app_metadata: { role: "staff" },
        user_metadata: { name: args.name },
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

    // 2. Insert Convex staff record.
    try {
      await ctx.runMutation(api.staff.create, {
        supabaseUserId: userId,
        email: args.email,
        name: args.name,
        merchantIds: args.merchantIds,
        allMerchants: args.allMerchants ?? false,
      });
    } catch (err: any) {
      // Best-effort auth user cleanup so retries don't collide on email.
      await fetchWithTimeout(
        `${supabaseUrl}/auth/v1/admin/users/${userId}`,
        {
          method: "DELETE",
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        },
        8000
      ).catch(() => {});
      throw new Error(`Failed to create staff record: ${err?.message ?? err}`);
    }

    return { userId };
  },
});

// Admin-only: promote an existing Supabase user's app_metadata to role='staff'.
// Use this to fix existing staff accounts that were created with user_metadata only.
export const adminSetStaffRole = action({
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
    if (!supabaseUrl || !serviceKey) throw new Error("Server not configured");

    const res = await fetchWithTimeout(`${supabaseUrl}/auth/v1/admin/users/${args.userId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ app_metadata: { role: "staff" } }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `Failed to update auth user (HTTP ${res.status}): ${errText || res.statusText}`
      );
    }
  },
});
