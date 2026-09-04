// ImageKit upload signing and file deletion.
//
// The ImageKit private key must never reach the browser: ImageKit has no
// unsigned-upload-preset equivalent, so every client upload needs a
// server-generated (token, expire, signature) triple. This function is the only
// place the private key exists.
//
// Actions (POST JSON body):
//   { action: "auth" }
//     -> { token, expire, signature, publicKey } for a direct browser upload
//   { action: "delete", filePath: "/menu-items/burger_abc.jpg" }
//     -> { ok: true } after resolving the path to a fileId and deleting it
//
// Caller must be signed in. Deletion additionally requires admin or staff.
//
// Deploy:
//   supabase secrets set IMAGEKIT_PRIVATE_KEY=... IMAGEKIT_PUBLIC_KEY=...
//   supabase functions deploy imagekit-auth

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
const IMAGEKIT_API_BASE = "https://api.imagekit.io/v1";

// ImageKit rejects an expiry more than 1 hour out; keep the window short so a
// leaked token is only briefly useful.
const TOKEN_TTL_SECONDS = 30 * 60;

/** HMAC-SHA1 of `token + expire`, hex encoded — the signature ImageKit expects. */
async function signUploadRequest(
  privateKey: string,
  token: string,
  expire: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(privateKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${token}${expire}`),
  );
  return Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function imageKitAuthHeader(privateKey: string): string {
  return `Basic ${btoa(`${privateKey}:`)}`;
}

/** ImageKit deletes by fileId, but the app only stores URLs — resolve one to the other. */
async function findFileIdByPath(
  privateKey: string,
  filePath: string,
): Promise<string | null> {
  const search = new URL(`${IMAGEKIT_API_BASE}/files`);
  search.searchParams.set("searchQuery", `filePath = "${filePath}"`);
  search.searchParams.set("limit", "1");

  const response = await fetch(search, {
    headers: { Authorization: imageKitAuthHeader(privateKey) },
  });
  if (!response.ok) {
    throw new Error(`ImageKit lookup failed with status ${response.status}`);
  }

  const files = await response.json();
  return Array.isArray(files) && files.length > 0 ? files[0].fileId : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const privateKey = Deno.env.get("IMAGEKIT_PRIVATE_KEY");
  const publicKey = Deno.env.get("IMAGEKIT_PUBLIC_KEY");
  if (!privateKey || !publicKey) {
    return json({ error: "ImageKit keys are not configured on the server" }, 500);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- Authenticate the caller ---------------------------------------------
  // Uploads are only ever initiated by signed-in admins, staff or riders, so an
  // authenticated session is the minimum bar for obtaining a signature.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Unauthorized: not signed in" }, 401);

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json({ error: "Unauthorized: invalid session" }, 401);
  const caller = userData.user;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    switch (body.action) {
      case "auth": {
        const token = crypto.randomUUID();
        const expire = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
        const signature = await signUploadRequest(privateKey, token, expire);
        return json({ token, expire, signature, publicKey });
      }

      case "delete": {
        const { filePath } = body as { filePath?: string };
        if (typeof filePath !== "string" || !filePath.startsWith("/")) {
          return json({ error: "Invalid filePath" }, 400);
        }

        // Deleting is destructive and cannot be undone — restrict to admins and
        // active staff rather than every signed-in user.
        let canDelete =
          caller.app_metadata?.role === "admin" ||
          caller.email?.toLowerCase() === LEGACY_ADMIN_EMAIL;
        if (!canDelete) {
          const { data: staffRow } = await admin
            .from("staff")
            .select("is_active")
            .eq("supabase_user_id", caller.id)
            .maybeSingle();
          canDelete = !!staffRow?.is_active;
        }
        if (!canDelete) return json({ error: "Unauthorized: Admin access required" }, 403);

        const fileId = await findFileIdByPath(privateKey, filePath);
        // Already gone (or never existed) — the caller's intent is satisfied.
        if (!fileId) return json({ ok: true, deleted: false });

        const response = await fetch(`${IMAGEKIT_API_BASE}/files/${fileId}`, {
          method: "DELETE",
          headers: { Authorization: imageKitAuthHeader(privateKey) },
        });
        if (!response.ok && response.status !== 404) {
          return json({ error: `ImageKit delete failed with status ${response.status}` }, 400);
        }
        return json({ ok: true, deleted: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
