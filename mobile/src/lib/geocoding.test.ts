// Address lookups go through the web deployment's proxy rather than straight to
// Apple, so these tests assert on what the phone puts on the wire and on how it
// classifies each way the round trip can fail. The classification is the part
// that matters in the UI: a misconfigured build must stop the search dead,
// while a flaky connection must leave the next keystroke free to retry.

import {
  isWithinPhilippines,
  reverseGeocode,
  suggestAddresses,
} from './geocoding';
import { GeocodingError, isGeocodingConfigError } from './geocodingError';

const WEB_ORIGIN = 'https://row-nel.com';

const MANILA = { latitude: 14.5995, longitude: 120.9842 };

const CANDIDATE = {
  placeId: '/v1/search?q=Jollibee',
  name: 'Jollibee Rizal Avenue',
  displayName: 'Jollibee Rizal Avenue, Santa Cruz, Manila',
  context: 'Santa Cruz, Manila',
  latitude: MANILA.latitude,
  longitude: MANILA.longitude,
};

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

describe('address lookups', () => {
  const originalOrigin = process.env.EXPO_PUBLIC_WEB_ORIGIN;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_WEB_ORIGIN = WEB_ORIGIN;
    fetchMock = jest.fn().mockResolvedValue(jsonResponse({ results: [] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_WEB_ORIGIN = originalOrigin;
    jest.restoreAllMocks();
  });

  const requestedUrl = (): string => String(fetchMock.mock.calls[0][0]);

  describe('suggestAddresses', () => {
    it('asks the web deployment, never Apple directly', async () => {
      // Arrange

      // Act
      await suggestAddresses('jollibee');

      // Assert — an Apple token must never reach an installed binary
      expect(requestedUrl()).toContain(`${WEB_ORIGIN}/api/maps-search`);
      expect(requestedUrl()).not.toContain('maps-api.apple.com');
    });

    it('returns the candidates the proxy sent', async () => {
      // Arrange
      fetchMock.mockResolvedValue(jsonResponse({ results: [CANDIDATE] }));

      // Act
      const candidates = await suggestAddresses('jollibee');

      // Assert — each row already carries its coordinate, so no second lookup
      expect(candidates).toEqual([CANDIDATE]);
    });

    it('sends the phone’s fix so nearby results rank first', async () => {
      // Arrange

      // Act
      await suggestAddresses('rizal street', { proximity: MANILA });

      // Assert
      expect(requestedUrl()).toContain('lat=14.5995');
      expect(requestedUrl()).toContain('lng=120.9842');
    });

    it('omits a proximity that is not a real coordinate', async () => {
      // Arrange

      // Act
      await suggestAddresses('rizal', { proximity: { latitude: NaN, longitude: NaN } });

      // Assert — NaN in the query string is a 400 from the proxy
      expect(requestedUrl()).not.toContain('lat=');
    });

    it('caps the limit at what the proxy accepts', async () => {
      // Arrange

      // Act
      await suggestAddresses('rizal', { limit: 50 });

      // Assert
      expect(requestedUrl()).toContain('limit=10');
    });

    it('returns nothing for a blank query without calling out', async () => {
      // Arrange

      // Act
      const candidates = await suggestAddresses('   ');

      // Assert
      expect(candidates).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports a missing web origin as a build problem, not an outage', async () => {
      // Arrange
      delete process.env.EXPO_PUBLIC_WEB_ORIGIN;

      // Act
      const error = await suggestAddresses('jollibee').catch((err: unknown) => err);

      // Assert — nothing the customer types will fix this, so searching stops
      expect(isGeocodingConfigError(error)).toBe(true);
    });

    it('classifies a refused request as an auth failure', async () => {
      // Arrange
      fetchMock.mockResolvedValue(jsonResponse({ error: 'nope' }, 401));

      // Act
      const error = (await suggestAddresses('x').catch((err: unknown) => err)) as GeocodingError;

      // Assert
      expect(error.kind).toBe('auth');
    });

    it('classifies a quota refusal as rate limiting', async () => {
      // Arrange
      fetchMock.mockResolvedValue(jsonResponse({ error: 'quota' }, 429));

      // Act
      const error = (await suggestAddresses('x').catch((err: unknown) => err)) as GeocodingError;

      // Assert — transient: the customer should try again shortly
      expect(error.kind).toBe('rate-limit');
      expect(isGeocodingConfigError(error)).toBe(false);
    });

    it('classifies a dropped connection as a network failure', async () => {
      // Arrange
      fetchMock.mockRejectedValue(new TypeError('Network request failed'));

      // Act
      const error = (await suggestAddresses('x').catch((err: unknown) => err)) as GeocodingError;

      // Assert
      expect(error.kind).toBe('network');
    });

    it('reports a superseded request as cancelled, not as a failure', async () => {
      // Arrange
      const controller = new AbortController();
      fetchMock.mockImplementation(() => {
        controller.abort();
        const abortError = new Error('Aborted');
        abortError.name = 'AbortError';
        return Promise.reject(abortError);
      });

      // Act — the next keystroke cancels this one; the UI must show nothing
      const error = (await suggestAddresses('x', { signal: controller.signal }).catch(
        (err: unknown) => err
      )) as GeocodingError;

      // Assert
      expect(error.kind).toBe('aborted');
    });
  });

  describe('reverseGeocode', () => {
    it('asks the proxy for the coordinate it was given', async () => {
      // Arrange
      fetchMock.mockResolvedValue(
        jsonResponse({
          placeId: '',
          displayName: '1 Rizal Avenue, Santa Cruz, Manila',
          street: '1 Rizal Avenue',
          ...MANILA,
        })
      );

      // Act
      const result = await reverseGeocode(MANILA.latitude, MANILA.longitude);

      // Assert
      expect(requestedUrl()).toContain('/api/maps-reverse');
      expect(requestedUrl()).toContain('lat=14.5995');
      expect(result.street).toBe('1 Rizal Avenue');
    });

    it('surfaces an outage so the caller can fall back to the device geocoder', async () => {
      // Arrange
      fetchMock.mockResolvedValue(jsonResponse({ error: 'down' }, 502));

      // Act / Assert
      await expect(reverseGeocode(MANILA.latitude, MANILA.longitude)).rejects.toBeInstanceOf(
        GeocodingError
      );
    });
  });
});

describe('isWithinPhilippines', () => {
  it('accepts a coastal pin and rejects a neighbouring country', async () => {
    // Arrange
    process.env.EXPO_PUBLIC_WEB_ORIGIN = WEB_ORIGIN;

    // Act / Assert
    expect(isWithinPhilippines(4.55, 116.95)).toBe(true);
    expect(isWithinPhilippines(5.98, 116.07)).toBe(false);
  });
});
