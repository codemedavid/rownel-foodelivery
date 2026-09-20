import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PHILIPPINES_BOUNDS,
  createSearchSessionToken,
  isWithinPhilippines,
  retrieveAddress,
  reverseGeocode,
  suggestAddresses,
} from './geocoding';

const addressFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [120.617805, 17.595814] },
  properties: {
    mapbox_id: 'dXJuOm1ieGFkcjo3Zjcz',
    feature_type: 'address',
    full_address: '10 Rizal Street, Bangued, Abra, Philippines',
    name: '10 Rizal Street',
    coordinates: { longitude: 120.617805, latitude: 17.595814 },
    context: {
      address: { address_number: '10', street_name: 'Rizal Street' },
      street: { name: 'Rizal Street' },
      place: { name: 'Bangued' },
      region: { name: 'Abra' },
      country: { name: 'Philippines', country_code: 'PH' },
    },
  },
};

const placeFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [120.401718, 16.82072] },
  properties: {
    mapbox_id: 'dXJuOm1ieHBsYzpFMGl6',
    feature_type: 'place',
    full_address: 'Balaoan, La Union, Philippines',
    name: 'Balaoan',
    coordinates: { longitude: 120.401718, latitude: 16.82072 },
    context: {
      place: { name: 'Balaoan' },
      region: { name: 'La Union' },
      country: { name: 'Philippines', country_code: 'PH' },
    },
  },
};

const foreignFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-57.5759, -25.2637] },
  properties: {
    mapbox_id: 'dXJuOm1ieHBsYzpQWQ',
    feature_type: 'locality',
    full_address: 'San Roque, Asuncion, Paraguay',
    name: 'San Roque',
    coordinates: { longitude: -57.5759, latitude: -25.2637 },
    context: { country: { name: 'Paraguay', country_code: 'PY' } },
  },
};

const poiSuggestion = {
  name: 'Buko Spot',
  mapbox_id: 'poi-buko-spot',
  feature_type: 'poi',
  full_address: 'Phase 4, Lucena, 4301, Philippines',
  place_formatted: 'Lucena, 4301, Philippines',
  context: { country: { name: 'Philippines', country_code: 'PH' } },
};

const streetSuggestion = {
  name: '10 Rizal Street',
  mapbox_id: 'addr-rizal',
  feature_type: 'address',
  full_address: '10 Rizal Street, Bangued, Abra, Philippines',
  place_formatted: 'Bangued, Abra, Philippines',
  context: { country: { name: 'Philippines', country_code: 'PH' } },
};

const retrievedPoiFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [121.62571486, 13.95260879] },
  properties: {
    mapbox_id: 'poi-buko-spot',
    feature_type: 'poi',
    name: 'Buko Spot',
    full_address: 'Phase 4, Lucena, 4301, Philippines',
    place_formatted: 'Lucena, 4301, Philippines',
    coordinates: { latitude: 13.95260879, longitude: 121.62571486 },
    context: { country: { name: 'Philippines', country_code: 'PH' } },
  },
};

const collectionOf = (...features: unknown[]) => ({
  type: 'FeatureCollection',
  features,
});

const okResponse = (body: unknown) =>
  ({ ok: true, json: async () => body }) as Response;

const fetchMock = vi.fn();

const lastRequestUrl = (): URL => {
  const calls = fetchMock.mock.calls;
  return new URL(String(calls[calls.length - 1][0]));
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isWithinPhilippines', () => {
  it('accepts coordinates inside the Philippine bounding box', () => {
    expect(isWithinPhilippines(14.5995, 120.9842)).toBe(true);
  });

  it('rejects coordinates outside the Philippine bounding box', () => {
    expect(isWithinPhilippines(40.748, -73.986)).toBe(false);
  });
});

describe('createSearchSessionToken', () => {
  it('issues a distinct token per search session', () => {
    // Arrange / Act
    const first = createSearchSessionToken();
    const second = createSearchSessionToken();

    // Assert — Mapbox bills one Search Box session per token
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });
});

describe('suggestAddresses', () => {
  const session = 'session-abc';

  it('returns an empty list for a blank query without calling the network', async () => {
    // Arrange / Act
    const results = await suggestAddresses('   ', { sessionToken: session });

    // Assert
    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks the Search Box suggest endpoint, bounded to the Philippines', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse({ suggestions: [poiSuggestion] }));

    // Act
    await suggestAddresses('Buko Spot', { sessionToken: session });

    // Assert
    const url = lastRequestUrl();
    expect(url.pathname).toBe('/search/searchbox/v1/suggest');
    expect(url.searchParams.get('q')).toBe('Buko Spot');
    expect(url.searchParams.get('country')).toBe('ph');
    expect(url.searchParams.get('bbox')).toBe('116.9283,4.5873,126.6042,21.3218');
    expect(url.searchParams.get('session_token')).toBe(session);
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('biases suggestions toward the supplied proximity point in lng,lat order', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse({ suggestions: [poiSuggestion] }));

    // Act
    await suggestAddresses('Buko Spot', {
      sessionToken: session,
      proximity: { latitude: 16.8207, longitude: 120.4017 },
    });

    // Assert
    expect(lastRequestUrl().searchParams.get('proximity')).toBe('120.4017,16.8207');
  });

  it('falls back to IP-based proximity when no reference point is known', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse({ suggestions: [poiSuggestion] }));

    // Act
    await suggestAddresses('Buko Spot', { sessionToken: session });

    // Assert
    expect(lastRequestUrl().searchParams.get('proximity')).toBe('ip');
  });

  it('leads a business result with its own name, not its street address', async () => {
    // Arrange — Mapbox omits the business name from full_address for a POI
    fetchMock.mockResolvedValue(okResponse({ suggestions: [poiSuggestion] }));

    // Act
    const [candidate] = await suggestAddresses('Buko Spot', { sessionToken: session });

    // Assert
    expect(candidate).toEqual({
      placeId: 'poi-buko-spot',
      name: 'Buko Spot',
      displayName: 'Buko Spot, Lucena, 4301, Philippines',
      context: 'Lucena, 4301, Philippines',
      featureType: 'poi',
    });
  });

  it('keeps the full address when it already begins with the feature name', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse({ suggestions: [streetSuggestion] }));

    // Act
    const [candidate] = await suggestAddresses('Rizal Street', { sessionToken: session });

    // Assert
    expect(candidate.displayName).toBe('10 Rizal Street, Bangued, Abra, Philippines');
  });

  it('drops suggestions that carry no id, since they cannot be retrieved', async () => {
    // Arrange
    fetchMock.mockResolvedValue(
      okResponse({ suggestions: [{ ...poiSuggestion, mapbox_id: '' }, streetSuggestion] })
    );

    // Act
    const results = await suggestAddresses('Rizal', { sessionToken: session });

    // Assert
    expect(results).toHaveLength(1);
    expect(results[0].placeId).toBe('addr-rizal');
  });

  it('throws when Mapbox rejects the request', async () => {
    // Arrange
    fetchMock.mockResolvedValue({ ok: false, status: 429 } as Response);

    // Act / Assert
    await expect(
      suggestAddresses('Buko Spot', { sessionToken: session })
    ).rejects.toThrow(/suggestion/i);
  });
});

describe('retrieveAddress', () => {
  const session = 'session-abc';

  it('retrieves the chosen suggestion by id within the same session', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(collectionOf(retrievedPoiFeature)));

    // Act
    await retrieveAddress('poi-buko-spot', { sessionToken: session });

    // Assert
    const url = lastRequestUrl();
    expect(url.pathname).toBe('/search/searchbox/v1/retrieve/poi-buko-spot');
    expect(url.searchParams.get('session_token')).toBe(session);
  });

  it('resolves the coordinates the suggest step did not carry', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(collectionOf(retrievedPoiFeature)));

    // Act
    const result = await retrieveAddress('poi-buko-spot', { sessionToken: session });

    // Assert
    expect(result).toEqual({
      placeId: 'poi-buko-spot',
      displayName: 'Buko Spot, Lucena, 4301, Philippines',
      latitude: 13.95260879,
      longitude: 121.62571486,
      countryCode: 'ph',
    });
  });

  it('returns null when the retrieved place sits outside the Philippines', async () => {
    // Arrange
    const abroad = {
      ...retrievedPoiFeature,
      properties: {
        ...retrievedPoiFeature.properties,
        coordinates: { latitude: -25.2637, longitude: -57.5759 },
      },
    };
    fetchMock.mockResolvedValue(okResponse(collectionOf(abroad)));

    // Act / Assert
    expect(await retrieveAddress('poi-abroad', { sessionToken: session })).toBeNull();
  });

  it('returns null when Mapbox knows nothing about the id', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(collectionOf()));

    // Act / Assert
    expect(await retrieveAddress('poi-missing', { sessionToken: session })).toBeNull();
  });
});

describe('reverseGeocode', () => {
  it('builds the street from the house number and street name', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(collectionOf(addressFeature)));

    // Act
    const result = await reverseGeocode(17.595814, 120.617805);

    // Assert
    expect(result).toEqual({
      placeId: 'dXJuOm1ieGFkcjo3Zjcz',
      displayName: '10 Rizal Street, Bangued, Abra, Philippines',
      street: '10 Rizal Street',
      latitude: 17.595814,
      longitude: 120.617805,
      countryCode: 'ph',
    });
  });

  it('falls back to the feature name when no street detail is available', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(collectionOf(placeFeature)));

    // Act
    const result = await reverseGeocode(16.82072, 120.401718);

    // Assert
    expect(result.street).toBe('Balaoan');
  });

  it('sends longitude and latitude as separate query parameters', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(collectionOf(addressFeature)));

    // Act
    await reverseGeocode(17.595814, 120.617805);

    // Assert
    const url = lastRequestUrl();
    expect(url.pathname).toBe('/search/geocode/v6/reverse');
    expect(url.searchParams.get('latitude')).toBe('17.595814');
    expect(url.searchParams.get('longitude')).toBe('120.617805');
  });

  it('falls back to the requested coordinates when Mapbox returns no features', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(collectionOf()));

    // Act
    const result = await reverseGeocode(17.5, 120.6);

    // Assert
    expect(result.latitude).toBe(17.5);
    expect(result.longitude).toBe(120.6);
    expect(result.displayName).toBe('17.50000, 120.60000');
    expect(result.street).toBe('Current location');
    expect(result.placeId).toBe('');
  });

  it('throws when Mapbox rejects the request', async () => {
    // Arrange
    fetchMock.mockResolvedValue({ ok: false, status: 429 } as Response);

    // Act / Assert
    await expect(reverseGeocode(17.5, 120.6)).rejects.toThrow(
      'Failed to reverse geocode location'
    );
  });
});

describe('PHILIPPINES_BOUNDS', () => {
  it('is a [southwest, northeast] pair in Mapbox [lng, lat] order', () => {
    // Arrange
    const [[west, south], [east, north]] = PHILIPPINES_BOUNDS;

    // Assert — longitudes near 120, latitudes near 5..21
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    expect(west).toBeCloseTo(116.9283, 4);
    expect(south).toBeCloseTo(4.5873, 4);
    expect(east).toBeCloseTo(126.6042, 4);
    expect(north).toBeCloseTo(21.3218, 4);
  });

  it('contains Manila and excludes Hong Kong', () => {
    // Arrange
    const [[west, south], [east, north]] = PHILIPPINES_BOUNDS;
    const contains = (lng: number, lat: number) =>
      lng >= west && lng <= east && lat >= south && lat <= north;

    // Assert
    expect(contains(120.9842, 14.5995)).toBe(true);
    expect(contains(114.1694, 22.3193)).toBe(false);
  });
});
