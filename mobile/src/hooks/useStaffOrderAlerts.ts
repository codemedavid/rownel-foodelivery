import { useEffect } from 'react';
import { Vibration } from 'react-native';
import { supabase } from '../lib/supabase';
import { mapNotification } from '../lib/adminMappers';
import { presentLocalNotification } from '../lib/notifications';

interface Options {
  /** When push is registered, the server already delivers a banner; skip the local one. */
  isPushAvailable: boolean;
  onNotification?: () => void;
}

const VIBRATE_PATTERN = [0, 200, 100, 200];

/**
 * Listens for new rows in `notifications` addressed to this user and reacts
 * in-app (vibration, unread bump, optional local banner).
 */
export const useStaffOrderAlerts = (
  userId: string | null | undefined,
  { isPushAvailable, onNotification }: Options
): void => {
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          const notification = mapNotification(payload.new as Record<string, unknown>);
          Vibration.vibrate(VIBRATE_PATTERN);
          onNotification?.();
          if (!isPushAvailable) {
            presentLocalNotification(notification.title, notification.body, {
              ...notification.data,
              notificationId: notification.id,
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, isPushAvailable, onNotification]);
};
