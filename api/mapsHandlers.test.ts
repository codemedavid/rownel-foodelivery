// Exercises the deployed proxy endpoints, not just the parsing helpers. The
// whole point of proxying is that the Apple access token stays here, so these
// assert on what actually crosses the wire: the token never appears in a
// response, malformed input is refused before Apple is called at all, and an
// Apple outage is not reported to the phone as the customer's mistake.
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import searchHandler from './maps-search.ts';
import reverseHandler from './maps-reverse.ts';
import { resetAppleMapsAccessTokenForTests } from './_lib/appleMapsAccessToken.ts';

const APPLE_TOKEN_URL = 'https://maps-api.apple.com/v1/token';
const ACCESS_TOKEN = 'apple-access-token-value';

/** A fresh throwaway key per run; the real one never belongs in a test. */
const generatePem = async (): Promise<string> => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const body = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
};

const jsonOk = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200 });

interface StubOptions {
  /** What the Apple data endpoint answers with, once the token is issued. */
  data?: Response;
  token?: Response;
}

/**
 * Stands in for both Apple calls. Returns the mock so a test can assert on
 * which URLs were reached — "Apple was never called" is the assertion that
 * proves validation ran first.
 */
const stubApple = ({ data = jsonOk({ results: [] }), token }: StubOptions = {}) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith(APPLE_TOKEN_URL)) {
      return token ?? jsonOk({ accessToken: ACCESS_TOKEN, expiresInSeconds: 1800 });
    }
    return data;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const search = (query: string) =>
  searchHandler(new Request(`https://row-nel.com/api/maps-search${query}`));

const reverse = (query: string) =>
  reverseHandler(new Request(`https://row-nel.com/api/maps-reverse${query}`));

describe('the maps proxy endpoints', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('MAPKIT_TEAM_ID', 'TEAMID1234');
    vi.stubEnv('MAPKIT_KEY_ID', 'KEYID12345');
    vi.stubEnv('MAPKIT_PRIVATE_KEY', await generatePem());
    resetAppleMapsAccessTokenForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('GET /api/maps-search', () => {
    it('queries /v1/search, whose rows always carry a coordinate', async () => {
      // Arrange
      const fetchMock = stubApple();

      // Act
      await search('?q=jollibee');

      // Assert — /v1/searchAutocomplete rows often carry no location at all,
      // which returns an empty dropdown for business-name searches
      const requested = fetchMock.mock.calls.map(([input]) => String(input)).join(' ');
      expect(requested).toContain('maps-api.apple.com/v1/search?');
      expect(requested).not.toContain('searchAutocomplete');
    });

    it('does not send a resultTypeFilter, which silently matches nothing when wrong', async () => {
      // Arrange
      const fetchMock = stubApple();

      // Act
      await search('?q=jollibee');

      // Assert — omitted, Apple returns both addresses and businesses
      const requested = fetchMock.mock.calls.map(([input]) => String(input)).join(' ');
      expect(requested).not.toContain('resultTypeFilter');
    });

    it('returns Apple’s suggestions in the shape the web client uses', async () => {
      // Arrange
      stubApple({
        data: jsonOk({
          results: [
            {
              name: 'Jollibee Rizal Avenue',
              formattedAddressLines: ['Rizal Avenue', 'Santa Cruz', 'Manila'],
              coordinate: { latitude: 14.5995, longitude: 120.9842 },
              countryCode: 'PH',
            },
          ],
        }),
      });

      // Act
      const response = await search('?q=jollibee');
      const body = (await response.json()) as { results: unknown[] };

      // Assert
      expect(response.status).toBe(200);
      expect(body.results).toEqual([
        {
          placeId: '',
          name: 'Jollibee Rizal Avenue',
          displayName: 'Jollibee Rizal Avenue, Rizal Avenue, Santa Cruz, Manila',
          context: 'Rizal Avenue, Santa Cruz, Manila',
          latitude: 14.5995,
          longitude: 120.9842,
          countryCode: 'ph',
        },
      ]);
    });

    it('never lets the Apple access token reach the phone', async () => {
      // Arrange
      stubApple();

      // Act — the token is what proxying exists to keep server-side
      const text = await (await search('?q=jollibee')).text();

      // Assert
      expect(text).not.toContain(ACCESS_TOKEN);
    });

    it('clamps the search to the Philippines whatever the caller asks for', async () => {
      // Arrange
      const fetchMock = stubApple();

      // Act
      await search('?q=jollibee');

      // Assert — a client cannot widen the search by omitting a parameter
      const requested = fetchMock.mock.calls.map(([input]) => String(input)).join(' ');
      expect(requested).toContain('limitToCountries=PH');
      expect(requested).toContain('searchRegion=');
    });

    it('biases ranking toward the phone’s fix when one is supplied', async () => {
      // Arrange
      const fetchMock = stubApple();

      // Act
      await search('?q=jollibee&lat=14.5995&lng=120.9842');

      // Assert
      const requested = fetchMock.mock.calls.map(([input]) => String(input)).join(' ');
      expect(requested).toContain('searchLocation=14.5995%2C120.9842');
    });

    it('refuses an empty query without spending a service call', async () => {
      // Arrange
      const fetchMock = stubApple();

      // Act
      const response = await search('?q=%20%20');

      // Assert — the daily quota is finite; validation runs first
      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a limit outside the supported range', async () => {
      // Arrange
      stubApple();

      // Act / Assert
      expect((await search('?q=jollibee&limit=50')).status).toBe(400);
    });

    it('reports an Apple outage as a gateway failure, not a bad request', async () => {
      // Arrange
      stubApple({ data: new Response('upstream exploded', { status: 500 }) });

      // Act
      const response = await search('?q=jollibee');

      // Assert — 4xx would tell the app to stop retrying, which is wrong here
      expect(response.status).toBe(502);
    });

    it('passes Apple’s quota refusal through as 429', async () => {
      // Arrange
      stubApple({ data: new Response('quota exceeded', { status: 429 }) });

      // Act / Assert — the app backs off rather than hammering the quota
      expect((await search('?q=jollibee')).status).toBe(429);
    });

    it('hides a misconfigured deployment behind a flat 500', async () => {
      // Arrange
      vi.stubEnv('MAPKIT_PRIVATE_KEY', '');
      stubApple();

      // Act
      const response = await search('?q=jollibee');

      // Assert — the missing variable is named in the logs, not to the phone
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain('MAPKIT_PRIVATE_KEY');
    });

    it('rejects a method other than GET', async () => {
      // Arrange / Act
      const response = await searchHandler(
        new Request('https://row-nel.com/api/maps-search?q=x', { method: 'POST' })
      );

      // Assert
      expect(response.status).toBe(405);
    });

    it('answers a browser preflight, so Expo web can call it too', async () => {
      // Arrange / Act
      const response = await searchHandler(
        new Request('https://row-nel.com/api/maps-search', { method: 'OPTIONS' })
      );

      // Assert
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('GET /api/maps-reverse', () => {
    it('returns the street-level address for a coordinate', async () => {
      // Arrange
      stubApple({
        data: jsonOk({
          results: [
            {
              coordinate: { latitude: 14.5995, longitude: 120.9842 },
              name: 'Jollibee',
              formattedAddressLines: ['1 Rizal Avenue', 'Santa Cruz', 'Manila'],
              structuredAddress: { fullThoroughfare: '1 Rizal Avenue' },
              countryCode: 'PH',
            },
          ],
        }),
      });

      // Act
      const response = await reverse('?lat=14.5995&lng=120.9842');

      // Assert
      expect(await response.json()).toMatchObject({
        displayName: '1 Rizal Avenue, Santa Cruz, Manila',
        street: '1 Rizal Avenue',
      });
    });

    it('labels a coordinate Apple has no match for', async () => {
      // Arrange
      stubApple({ data: jsonOk({ results: [] }) });

      // Act — a pin dropped at sea still has to yield a usable address
      const response = await reverse('?lat=14.5995&lng=120.9842');

      // Assert
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ displayName: '14.59950, 120.98420' });
    });

    it('refuses a missing coordinate rather than reading it as 0,0', async () => {
      // Arrange
      const fetchMock = stubApple();

      // Act — Number('') is 0, a real place in the Gulf of Guinea
      const response = await reverse('?lat=&lng=');

      // Assert
      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a latitude off the globe', async () => {
      // Arrange
      stubApple();

      // Act / Assert
      expect((await reverse('?lat=200&lng=120')).status).toBe(400);
    });

    it('refuses a non-numeric coordinate', async () => {
      // Arrange
      stubApple();

      // Act / Assert
      expect((await reverse('?lat=north&lng=120')).status).toBe(400);
    });
  });

  describe('the Apple access token', () => {
    it('is exchanged once and reused across requests', async () => {
      // Arrange
      const fetchMock = stubApple();

      // Act — the exchange itself counts against the daily quota
      await search('?q=one');
      await search('?q=two');

      // Assert
      const tokenCalls = fetchMock.mock.calls.filter(([input]) =>
        String(input).startsWith(APPLE_TOKEN_URL)
      );
      expect(tokenCalls).toHaveLength(1);
    });

    it('is not cached after a failed exchange, so the next request retries', async () => {
      // Arrange
      stubApple({ token: new Response('nope', { status: 401 }) });

      // Act
      const first = await search('?q=one');

      stubApple();
      const second = await search('?q=two');

      // Assert
      expect(first.status).toBe(500);
      expect(second.status).toBe(200);
    });
  });
});
