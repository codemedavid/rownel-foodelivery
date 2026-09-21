jest.mock('expo-location', () => ({
  reverseGeocodeAsync: jest.fn(),
}));

import * as ExpoLocation from 'expo-location';
import { formatCoordinateLabel, resolveAddress } from './resolveAddress';

const mockedExpoReverse = ExpoLocation.reverseGeocodeAsync as jest.Mock;

const LAT = 17.5747;
const LNG = 120.3869;

const stubProxy = (body: unknown) => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  }) as unknown as typeof fetch;
};

const failProxy = () => {
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
};

describe('resolveAddress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_WEB_ORIGIN = 'https://row-nel.test';
    mockedExpoReverse.mockResolvedValue([]);
  });

  test('prefers Apple Maps, which keeps the house number', async () => {
    stubProxy({
      placeId: 'p1',
      displayName: '12 Rizal Street, Vigan, Ilocos Sur',
      street: '12 Rizal Street',
      latitude: LAT,
      longitude: LNG,
    });

    const result = await resolveAddress(LAT, LNG);

    expect(result).toEqual({
      displayName: '12 Rizal Street, Vigan, Ilocos Sur',
      street: '12 Rizal Street',
    });
    expect(mockedExpoReverse).not.toHaveBeenCalled();
  });

  test('falls back to the street line when the proxy omits the short one', async () => {
    stubProxy({
      placeId: 'p1',
      displayName: 'Plaza Burgos, Vigan',
      street: '',
      latitude: LAT,
      longitude: LNG,
    });

    expect(await resolveAddress(LAT, LNG)).toEqual({
      displayName: 'Plaza Burgos, Vigan',
      street: 'Plaza Burgos, Vigan',
    });
  });

  test('falls back to the on-device geocoder when the proxy is unreachable', async () => {
    failProxy();
    mockedExpoReverse.mockResolvedValue([
      {
        streetNumber: '7',
        street: 'Quirino Blvd',
        district: 'Barangay 5',
        city: 'Vigan',
        region: 'Ilocos Sur',
      },
    ]);

    expect(await resolveAddress(LAT, LNG)).toEqual({
      displayName: '7 Quirino Blvd, Barangay 5, Vigan, Ilocos Sur',
      street: '7 Quirino Blvd',
    });
  });

  test('uses the place name when the on-device geocoder has no street', async () => {
    failProxy();
    mockedExpoReverse.mockResolvedValue([
      { name: 'Vigan Cathedral', city: 'Vigan', region: 'Ilocos Sur' },
    ]);

    expect(await resolveAddress(LAT, LNG)).toEqual({
      displayName: 'Vigan Cathedral, Vigan, Ilocos Sur',
      street: 'Vigan Cathedral',
    });
  });

  test('returns empty strings rather than throwing when nothing can name the point', async () => {
    failProxy();
    mockedExpoReverse.mockResolvedValue([]);

    expect(await resolveAddress(LAT, LNG)).toEqual({ displayName: '', street: '' });
  });

  test('survives an on-device geocoder that throws', async () => {
    failProxy();
    mockedExpoReverse.mockRejectedValue(new Error('geocoder unavailable'));

    expect(await resolveAddress(LAT, LNG)).toEqual({ displayName: '', street: '' });
  });

  test('falls through when the proxy answers with no name at all', async () => {
    stubProxy({ placeId: '', displayName: '', street: '', latitude: LAT, longitude: LNG });
    mockedExpoReverse.mockResolvedValue([{ street: 'Quirino Blvd', city: 'Vigan' }]);

    expect(await resolveAddress(LAT, LNG)).toEqual({
      displayName: 'Quirino Blvd, Vigan',
      street: 'Quirino Blvd',
    });
  });
});

describe('formatCoordinateLabel', () => {
  test('is precise enough to identify a building', () => {
    expect(formatCoordinateLabel(LAT, LNG)).toBe('17.57470, 120.38690');
  });
});
