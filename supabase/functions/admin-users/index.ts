// Admin user management — replaces the Convex staffActions/riderActions bridge.
//
// Actions (POST JSON body):
//   { action: "create-staff", email, password, name, merchantIds, allMerchants? }
//   { action: "create-rider", email, password, name, phone, plateNumber,
//     vehicleType, paymentMode?, paymentValue? }
//   { action: "set-role", userId, role: "staff" | "rider" }
//
// Caller must be an admin (app_metadata.role === "admin", the legacy admin
// email, or an active staff record with all_merchants).
//
// Deploy: supabase functions deploy admin-users
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are injected
// automatically by the platform.)

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const LEGACY_ADMIN_EMAIL = "admin@clickeats.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- Authenticate and authorize the caller -------------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Unauthorized: not signed in" }, 401);

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json({ error: "Unauthorized: invalid session" }, 401);
  const caller = userData.user;

  let isAdmin =
    caller.app_metadata?.role === "admin" ||
    caller.email?.toLowerCase() === LEGACY_ADMIN_EMAIL;
  if (!isAdmin) {
    const { data: staffRow } = await admin
      .from("staff")
      .select("is_active, all_merchants")
      .eq("supabase_user_id", caller.id)
      .maybeSingle();
    isAdmin = !!(staffRow?.is_active && staffRow?.all_merchants);
  }
  if (!isAdmin) return json({ error: "Unauthorized: Admin access required" }, 403);

  // --- Dispatch -------------------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    switch (body.action) {
      case "create-staff": {
        const { email, password, name, merchantIds, allMerchants } = body as {
          email: string; password: string; name: string;
          merchantIds: string[]; allMerchants?: boolean;
        };
        if (!email || !password || !name) return json({ error: "Missing required fields" }, 400);

        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: { role: "staff" },
          user_metadata: { name },
        });
        if (createErr || !created.user) {
          return json({ error: `Failed to create auth user: ${createErr?.message}` }, 400);
        }

        const { error: insertErr } = await admin.from("staff").insert({
          supabase_user_id: created.user.id,
          email,
          name,
          merchant_ids: merchantIds ?? [],
          all_merchants: allMerchants ?? false,
          is_active: true,
        });
        if (insertErr) {
          // Clean up so retries don't collide on email.
          await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
          return json({ error: `Failed to create staff record: ${insertErr.message}` }, 400);
        }
        return json({ userId: created.user.id });
      }

      case "create-rider": {
        const { email, password, name, phone, plateNumber, vehicleType, paymentMode, paymentValue } =
          body as {
            email: string; password: string; name: string; phone: string;
            plateNumber: string; vehicleType: string;
            paymentMode?: string; paymentValue?: number;
          };
        if (!email || !password || !name || !phone || !plateNumber || !vehicleType) {
          return json({ error: "Missing required fields" }, 400);
        }
        if (!["motorcycle", "bicycle", "car"].includes(vehicleType)) {
          return json({ error: "Invalid vehicle type" }, 400);
        }

        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: { role: "rider" },
          user_metadata: { name, role: "rider" },
        });
        if (createErr || !created.user) {
          return json({ error: `Failed to create auth user: ${createErr?.message}` }, 400);
        }

        const { error: insertErr } = await admin.from("riders").insert({
          id: created.user.id,
          name,
          phone,
          plate_number: plateNumber,
          vehicle_type: vehicleType,
          is_approved: true,
          is_active: true,
          payment_mode: paymentMode ?? null,
          payment_value: paymentValue ?? null,
        });
        if (insertErr) {
          await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
          return json({ error: `Failed to insert rider profile: ${insertErr.message}` }, 400);
        }
        return json({ userId: created.user.id });
      }

      case "set-role": {
        const { userId, role } = body as { userId: string; role: string };
        if (!userId || !["staff", "rider"].includes(role)) {
          return json({ error: "Invalid userId or role" }, 400);
        }
        const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
          app_metadata: { role },
        });
        if (updateErr) return json({ error: `Failed to update user: ${updateErr.message}` }, 400);
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
