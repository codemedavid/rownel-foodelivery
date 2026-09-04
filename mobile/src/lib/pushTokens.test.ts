import { buildPushTokenRow, isValidExpoPushToken } from './pushTokens';

describe('isValidExpoPushToken', () => {
  it('accepts Expo push token formats', () => {
    expect(isValidExpoPushToken('ExponentPushToken[abc123]')).toBe(true);
    expect(isValidExpoPushToken('ExpoPushToken[abc123]')).toBe(true);
  });

  it('rejects other strings', () => {
    expect(isValidExpoPushToken('')).toBe(false);
    expect(isValidExpoPushToken('fcm:abc')).toBe(false);
    expect(isValidExpoPushToken('ExponentPushToken[]')).toBe(false);
  });
});

describe('buildPushTokenRow', () => {
  it('produces a snake_case row for upsert', () => {
    const row = buildPushTokenRow({
      token: 'ExponentPushToken[abc]',
      userId: 'u1',
      platform: 'ios',
      deviceName: 'iPhone',
      appVersion: '1.0.0',
    });
    expect(row).toEqual({
      token: 'ExponentPushToken[abc]',
      user_id: 'u1',
      platform: 'ios',
      device_name: 'iPhone',
      app_version: '1.0.0',
    });
  });

  it('throws on an invalid token or platform', () => {
    expect(() => buildPushTokenRow({ token: 'nope', userId: 'u', platform: 'ios' })).toThrow(/token/i);
    expect(() =>
      buildPushTokenRow({ token: 'ExponentPushToken[a]', userId: 'u', platform: 'web' as never })
    ).toThrow(/platform/i);
  });
});
