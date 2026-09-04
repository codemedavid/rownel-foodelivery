import { useCallback } from 'react';
import { notificationsApi } from '../lib/notificationsApi';
import { useLiveQuery } from './useLiveQuery';

const UNREAD_POLL_MS = 120_000;

export const useUnreadNotificationCount = (userId: string | null | undefined) => {
  const fetcher = useCallback(() => notificationsApi.unreadCount(), []);
  const { data, refetch } = useLiveQuery(fetcher, [userId], {
    enabled: !!userId,
    pollMs: UNREAD_POLL_MS,
    realtime: userId
      ? [{ table: 'notifications', filter: `recipient_user_id=eq.${userId}` }]
      : [],
  });
  return { unreadCount: data ?? 0, refetch };
};
