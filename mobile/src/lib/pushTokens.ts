import type { PushPlatform, PushTokenRow } from './adminTypes';

const EXPO_PUSH_TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;
const PLATFORMS: readonly PushPlatform[] = ['ios', 'android'];

export const isValidExpoPushToken = (token: string): boolean => EXPO_PUSH_TOKEN_RE.test(token);

export interface PushTokenInput {
  token: string;
  userId: string;
  platform: PushPlatform;
  deviceName?: string;
  appVersion?: string;
}

export const buildPushTokenRow = (input: PushTokenInput): PushTokenRow => {
  if (!isValidExpoPushToken(input.token)) throw new Error('Invalid Expo push token');
  if (!PLATFORMS.includes(input.platform)) throw new Error('Unsupported push platform');
  return {
    token: input.token,
    user_id: input.userId,
    platform: input.platform,
    ...(input.deviceName ? { device_name: input.deviceName } : {}),
    ...(input.appVersion ? { app_version: input.appVersion } : {}),
  };
};
