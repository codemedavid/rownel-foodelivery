import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PHILIPPINES_BOUNDS,
  isWithinPhilippines,
  reverseGeocode,
  searchAddresses,
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

describe('searchAddresses', () => {
  it('returns an empty list for a blank query without calling the network', async () => {
    // Arrange / Act
    const results = await searchAddresses('   ');

    // Assert
    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a Mapbox address feature to an AddressSuggestion', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(collectionOf(addressFeature)));

    // Act
    const [suggestion] = await searchAddresses('Rizal Street Bangued');

    // Assert
    expect(suggestion).toEqual({
      placeId: 'dXJuOm1ieGFkcjo3Zjcz',
      displayName: '10 Rizal Street, Bangued, Abra, Philippines',
      latitude: 17.595814,
      longitude: 120.617805,
      countryCode: 'ph',
    });
  });

  it('requests the forward geocoding endpoint with the query and limit', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(collectionOf(placeFeature)));

    // Act
    await searchAddresses('Balaoan', { limit: 5 });

    // Assert
    const url = lastRequestUrl();
    expect(url.pathname).toBe('/search/geocode/v6/forward');
    expect(url.searchParams.get('q')).toBe('Balaoan');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('access_token')).toBeTruthy();
  });

  it('constrains every search to the Philippines without being asked', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(collectionOf(placeFeature)));

    // Act — no options at all, the way MerchantsList calls it
    await searchAddresses('Balaoan');

    // Assert
    const url = lastRequestUrl();
    expect(url.searchParams.get('country')).toBe('ph');
    expect(url.searchParams.get('bbox')).toBe('116.9283,4.5873,126.6042,21.3218');
  });

  it('requests ten suggestions by default', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(collectionOf(placeFeature)));

    // Act
    await searchAddresses('Balaoan');

    // Assert
    expect(lastRequestUrl().searchParams.get('limit')).toBe('10');
  });

  it('biases results toward the supplied proximity point in lng,lat order', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(collectionOf(placeFeature)));

    // Act
    await searchAddresses('Rizal Street', {
      proximity: { latitude: 17.5965, longitude: 120.618 },
    });

    // Assert — Mapbox wants longitude first
    expect(lastRequestUrl().searchParams.get('proximity')).toBe('120.618,17.5965');
  });

  it('falls back to IP-based proximity when no reference point is known', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(collectionOf(placeFeature)));

    // Act
    await searchAddresses('Rizal Street');

    // Assert
    expect(lastRequestUrl().searchParams.get('proximity')).toBe('ip');
  });

  it('drops suggestions that fall outside the Philippines', async () => {
    // Arrange — a same-named barangay in Paraguay, as Mapbox returns unfiltered
    fetchMock.mockResolvedValue(
      okResponse(collectionOf(foreignFeature, placeFeature))
    );

    // Act
    const results = await searchAddresses('San Roque');

    // Assert
    expect(results.map((result) => result.displayName)).toEqual([
      'Balaoan, La Union, Philippines',
    ]);
  });

  it('drops features that carry no usable coordinates', async () => {
    // Arrange
    const brokenFeature = {
      type: 'Feature',
      properties: {
        mapbox_id: 'broken',
        full_address: 'Nowhere',
        coordinates: { longitude: null, latitude: null },
      },
    };
    fetchMock.mockResolvedValue(okResponse(collectionOf(brokenFeature, addressFeature)));

    // Act
    const results = await searchAddresses('anything');

    // Assert
    expect(results).toHaveLength(1);
    expect(results[0].placeId).toBe('dXJuOm1ieGFkcjo3Zjcz');
  });

  it('throws when Mapbox rejects the request', async () => {
    // Arrange
    fetchMock.mockResolvedValue({ ok: false, status: 401 } as Response);

    // Act / Assert
    await expect(searchAddresses('Bangued')).rejects.toThrow(
      'Failed to fetch address suggestions'
    );
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
