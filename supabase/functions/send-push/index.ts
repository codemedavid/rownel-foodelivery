// send-push — delivers `notifications` rows to devices via Expo Push.
//
// Server-to-server only: called by the notify_order_change() trigger through
// pg_net and by the `push-sweep` cron job. Auth is a shared secret header
// (`x-push-secret`) matched against the Vault secret `send_push_secret`
// (read via the service-role-only push_config() RPC). PUSH_WEBHOOK_SECRET,
// when set as a function secret, takes precedence and skips the DB read.
//
// Body: { notificationIds?: string[], sweep?: boolean }
//
// Deploy: supabase functions deploy send-push --no-verify-jwt

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  EXPO_CHUNK_SIZE,
  EXPO_PUSH_URL,
  buildMessages,
  chunk,
  classifyTickets,
  groupTokensByUser,
  timingSafeEqual,
  type ExpoPushTicket,
  type NotificationRow,
  type PushTokenRow,
} from "./lib.ts";

const SWEEP_LIMIT = 200;
const SWEEP_WINDOW_MS = 60 * 60 * 1000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0).slice(0, SWEEP_LIMIT);
}

async function sendChunk(messages: ReadonlyArray<Record<string, unknown>>): Promise<ExpoPushTicket[]> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    throw new Error(`Expo push HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const payload = (await res.json()) as { data?: ExpoPushTicket[]; errors?: unknown };
  if (!Array.isArray(payload.data)) {
    throw new Error(`Expo push returned no tickets: ${JSON.stringify(payload.errors ?? payload).slice(0, 300)}`);
  }
  return payload.data;
}

async function expectedSecret(admin: ReturnType<typeof createClient>): Promise<string> {
  const fromEnv = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (fromEnv) return fromEnv;
  const { data, error } = await admin.rpc("push_config");
  if (error) {
    console.error("push_config lookup failed:", error.message);
    return "";
  }
  const row = Array.isArray(data) ? data[0] : data;
  return typeof row?.secret === "string" ? row.secret : "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const expected = await expectedSecret(admin);
  const provided = req.headers.get("x-push-secret") ?? "";
  if (!expected || !timingSafeEqual(expected, provided)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { notificationIds?: unknown; sweep?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const ids = parseIds(body.notificationIds);
  const isSweep = body.sweep === true;
  if (ids.length === 0 && !isSweep) return json({ error: "notificationIds or sweep required" }, 400);

  let query = admin
    .from("notifications")
    .select("id, recipient_user_id, kind, title, body, data")
    .is("pushed_at", null)
    .is("push_error", null)
    .limit(SWEEP_LIMIT);
  query = ids.length > 0
    ? query.in("id", ids)
    : query.gt("created_at", new Date(Date.now() - SWEEP_WINDOW_MS).toISOString());

  const { data: notifications, error: loadError } = await query;
  if (loadError) return json({ error: loadError.message }, 500);
  if (!notifications || notifications.length === 0) return json({ sent: 0, skipped: 0 });

  const userIds = [...new Set(notifications.map((n) => n.recipient_user_id))];
  const { data: tokenRows, error: tokenError } = await admin
    .from("push_tokens")
    .select("token, user_id")
    .in("user_id", userIds);
  if (tokenError) return json({ error: tokenError.message }, 500);

  const { messages, withoutTokens } = buildMessages(
    notifications as NotificationRow[],
    groupTokensByUser((tokenRows ?? []) as PushTokenRow[]),
  );

  const deadTokens: string[] = [];
  const failed = new Map<string, string>();
  const deliveredIds = new Set<string>();

  for (const batch of chunk(messages, EXPO_CHUNK_SIZE)) {
    try {
      const tickets = await sendChunk(batch.map(({ notificationId: _id, ...m }) => m));
      const result = classifyTickets(batch, tickets);
      deadTokens.push(...result.deadTokens);
      for (const [id, reason] of result.failedNotificationIds) failed.set(id, reason);
      for (const id of result.deliveredNotificationIds) deliveredIds.add(id);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error("send-push chunk failed:", reason);
      // Leave rows unpushed so the sweep retries transient Expo outages.
    }
  }

  const now = new Date().toISOString();
  const writes: Promise<unknown>[] = [];
  if (deliveredIds.size > 0) {
    writes.push(admin.from("notifications").update({ pushed_at: now }).in("id", [...deliveredIds]));
  }
  if (withoutTokens.length > 0) {
    writes.push(admin.from("notifications").update({ pushed_at: now, push_error: "no_tokens" }).in("id", withoutTokens));
  }
  for (const [id, reason] of failed) {
    if (deliveredIds.has(id)) continue; // delivered to at least one device
    writes.push(admin.from("notifications").update({ pushed_at: now, push_error: reason.slice(0, 200) }).eq("id", id));
  }
  if (deadTokens.length > 0) {
    writes.push(admin.from("push_tokens").delete().in("token", [...new Set(deadTokens)]));
  }
  const results = await Promise.allSettled(writes);
  const writeErrors = results.filter((r) => r.status === "rejected").length;

  return json({
    sent: deliveredIds.size,
    skipped: withoutTokens.length,
    failed: failed.size,
    deadTokens: deadTokens.length,
    writeErrors,
  });
});
