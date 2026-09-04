// Pure helpers for the send-push edge function. No Deno/Supabase imports so
// they stay trivially testable.

export interface NotificationRow {
  id: string;
  recipient_user_id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
}

export interface PushTokenRow {
  token: string;
  user_id: string;
}

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: "default";
  channelId: string;
  data: Record<string, unknown>;
}

export interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface TicketClassification {
  deadTokens: string[];
  deliveredNotificationIds: Set<string>;
  failedNotificationIds: Map<string, string>;
}

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_CHUNK_SIZE = 100;
export const ANDROID_CHANNEL_ID = "orders";

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function groupTokensByUser(tokens: readonly PushTokenRow[]): Map<string, string[]> {
  return tokens.reduce((acc, row) => {
    const existing = acc.get(row.user_id) ?? [];
    acc.set(row.user_id, [...existing, row.token]);
    return acc;
  }, new Map<string, string[]>());
}

/**
 * One Expo message per (notification, device token). Notifications whose
 * recipient has no device are reported in `withoutTokens` so the caller can
 * mark them and stop retrying.
 */
export function buildMessages(
  notifications: readonly NotificationRow[],
  tokensByUser: Map<string, string[]>,
): { messages: Array<ExpoPushMessage & { notificationId: string }>; withoutTokens: string[] } {
  const messages: Array<ExpoPushMessage & { notificationId: string }> = [];
  const withoutTokens: string[] = [];
  for (const n of notifications) {
    const tokens = tokensByUser.get(n.recipient_user_id) ?? [];
    if (tokens.length === 0) {
      withoutTokens.push(n.id);
      continue;
    }
    for (const token of tokens) {
      messages.push({
        notificationId: n.id,
        to: token,
        title: n.title,
        body: n.body,
        sound: "default",
        channelId: ANDROID_CHANNEL_ID,
        data: { ...(n.data ?? {}), notificationId: n.id },
      });
    }
  }
  return { messages, withoutTokens };
}

/**
 * Pairs Expo tickets back to the messages that produced them (same order).
 * DeviceNotRegistered tokens are dead and must be deleted; other errors are
 * recorded per notification so the sweep does not retry forever.
 */
export function classifyTickets(
  messages: ReadonlyArray<{ to: string; notificationId: string }>,
  tickets: readonly ExpoPushTicket[],
): TicketClassification {
  const deadTokens: string[] = [];
  const deliveredNotificationIds = new Set<string>();
  const failedNotificationIds = new Map<string, string>();
  tickets.forEach((ticket, index) => {
    const message = messages[index];
    if (!message) return;
    if (ticket.status === "ok") {
      deliveredNotificationIds.add(message.notificationId);
      return;
    }
    const code = ticket.details?.error ?? ticket.message ?? "unknown";
    if (code === "DeviceNotRegistered") {
      deadTokens.push(message.to);
      return;
    }
    if (!failedNotificationIds.has(message.notificationId)) {
      failedNotificationIds.set(message.notificationId, code);
    }
  });
  return { deadTokens, deliveredNotificationIds, failedNotificationIds };
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
