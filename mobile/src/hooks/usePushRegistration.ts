import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import {
  ensureAndroidChannel,
  getExpoPushToken,
  requestNotificationPermission,
} from '../lib/notifications';
import { notificationsApi } from '../lib/notificationsApi';

/**
 * Registers this device's Expo push token for the signed-in user. Exposes the
 * token so sign-out can delete it, and `isPushAvailable` so realtime hooks
 * know whether to fall back to local notifications.
 */
export const usePushRegistration = (userId: string | null | undefined) => {
  const [token, setToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      tokenRef.current = null;
      setToken(null);
      return;
    }
    (async () => {
      const granted = await requestNotificationPermission();
      if (!granted || cancelled) return;
      await ensureAndroidChannel();
      const next = await getExpoPushToken();
      if (!next || cancelled) return;
      try {
        await notificationsApi.registerPushToken({
          token: next,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          deviceName: Device.modelName ?? undefined,
          appVersion: Constants.expoConfig?.version ?? undefined,
        });
        if (!cancelled) {
          tokenRef.current = next;
          setToken(next);
        }
      } catch (err) {
        if (__DEV__) console.warn('Push token registration failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { pushToken: token, pushTokenRef: tokenRef, isPushAvailable: token !== null };
};
