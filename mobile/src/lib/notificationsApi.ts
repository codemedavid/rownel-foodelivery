import { supabase } from './supabase';
import { mapNotification } from './adminMappers';
import type { AppNotification, PushPlatform } from './adminTypes';

const LIST_LIMIT = 100;

const rows = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

export const notificationsApi = {
  async list(): Promise<AppNotification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (error) throw new Error(error.message);
    return rows(data).map(mapNotification);
  },

  async unreadCount(): Promise<number> {
    const { data, error } = await supabase.rpc('my_unread_notification_count');
    if (error) throw new Error(error.message);
    return typeof data === 'number' ? data : Number(data ?? 0);
  },

  async markRead(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase.rpc('mark_notifications_read', { p_ids: [...ids] });
    if (error) throw new Error(error.message);
  },

  async markAllRead(): Promise<void> {
    const { error } = await supabase.rpc('mark_all_notifications_read');
    if (error) throw new Error(error.message);
  },

  async registerPushToken(input: {
    token: string;
    platform: PushPlatform;
    deviceName?: string;
    appVersion?: string;
  }): Promise<void> {
    const { error } = await supabase.rpc('register_push_token', {
      p_token: input.token,
      p_platform: input.platform,
      p_device_name: input.deviceName ?? null,
      p_app_version: input.appVersion ?? null,
    });
    if (error) throw new Error(error.message);
  },

  async deletePushToken(token: string): Promise<void> {
    const { error } = await supabase.from('push_tokens').delete().eq('token', token);
    if (error) throw new Error(error.message);
  },
};
