import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { isValidExpoPushToken } from './pushTokens';

export const ORDERS_CHANNEL_ID = 'orders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const ensureAndroidChannel = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ORDERS_CHANNEL_ID, {
      name: 'Order updates',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch {
    // Channel creation is best-effort; notifications still fall back to the default channel.
  }
};

/** Returns true when notifications may be shown. Never throws. */
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    const next = await Notifications.requestPermissionsAsync();
    return next.status === 'granted';
  } catch {
    return false;
  }
};

const easProjectId = (): string | null => {
  const fromConfig = Constants.expoConfig?.extra?.eas?.projectId;
  const fromEas = Constants.easConfig?.projectId;
  const id = fromConfig ?? fromEas;
  return typeof id === 'string' && id ? id : null;
};

/**
 * Expo push token for this device, or null when push is impossible here
 * (simulator, Expo Go without a project id, permission denied).
 */
export const getExpoPushToken = async (): Promise<string | null> => {
  if (!Device.isDevice) return null;
  const projectId = easProjectId();
  if (!projectId) {
    if (__DEV__) console.warn('Push disabled: set extra.eas.projectId in app.json (run `npx eas init`).');
    return null;
  }
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return isValidExpoPushToken(data) ? data : null;
  } catch (err) {
    if (__DEV__) console.warn('Push token request failed:', err);
    return null;
  }
};

export const presentLocalNotification = async (
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<void> => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: 'default' },
      trigger: null,
    });
  } catch {
    // Local notifications are a convenience; the in-app UI is the source of truth.
  }
};
