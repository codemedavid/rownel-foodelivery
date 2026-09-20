import {
  formatDisplayName,
  formatStreetLine,
  isWithinPhilippines,
  reverseGeocode,
  searchAddresses,
} from './geocoding';

const addressProperties = {
  mapbox_id: 'addr-1',
  feature_type: 'address',
  full_address: '1 Rizal Street, Poblacion, Tagbilaran, Bohol, Philippines',
  name: '1 Rizal Street',
  coordinates: { longitude: 123.8854, latitude: 9.6496 },
  context: {
    address: { address_number: '1', street_name: 'Rizal Street' },
    street: { name: 'Rizal Street' },
    place: { name: 'Tagbilaran' },
    country: { name: 'Philippines', country_code: 'PH' },
  },
};

const placeProperties = {
  mapbox_id: 'place-1',
  feature_type: 'place',
  full_address: 'Island Mall, Panglao, Bohol, Philippines',
  name: 'Island Mall',
  coordinates: { longitude: 123.7489, latitude: 9.578 },
  context: { country: { name: 'Philippines', country_code: 'PH' } },
};

const collectionOf = (...properties: unknown[]) => ({
  type: 'FeatureCollection',
  features: properties.map((p) => ({ type: 'Feature', properties: p })),
});

const mockFetchOnce = (body: unknown, ok = true) => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  });
};

const lastUrl = (): URL => {
  const calls = (global.fetch as jest.Mock).mock.calls;
  return new URL(calls[calls.length - 1][0]);
};

beforeEach(() => {
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN = 'pk.test-mobile-token';
  global.fetch = jest.fn();
});

describe('formatDisplayName', () => {
  it('prefers the full address', () => {
    expect(formatDisplayName(addressProperties)).toBe(
      '1 Rizal Street, Poblacion, Tagbilaran, Bohol, Philippines'
    );
  });

  it('falls back to the feature name when no full address is present', () => {
    expect(formatDisplayName({ name: 'Somewhere, PH' })).toBe('Somewhere, PH');
  });

  it('returns an empty string when nothing is known', () => {
    expect(formatDisplayName({})).toBe('');
  });
});

describe('formatStreetLine', () => {
  it('combines the house number and street name', () => {
    expect(formatStreetLine(addressProperties)).toBe('1 Rizal Street');
  });

  it('uses the feature name when no street detail is known', () => {
    expect(formatStreetLine(placeProperties)).toBe('Island Mall');
  });

  it('returns a safe label when nothing is known', () => {
    expect(formatStreetLine({})).toBe('Current location');
  });
});

describe('isWithinPhilippines', () => {
  it('accepts a Philippine coordinate', () => {
    expect(isWithinPhilippines(14.5995, 120.9842)).toBe(true);
  });

  it('rejects a coordinate outside the country box', () => {
    expect(isWithinPhilippines(35.6762, 139.6503)).toBe(false);
  });
});

describe('reverseGeocode', () => {
  it('returns the street-level address for a GPS fix', async () => {
    // Arrange
    mockFetchOnce(collectionOf(addressProperties));

    // Act
    const result = await reverseGeocode(9.6496, 123.8854);

    // Assert
    expect(result).toEqual({
      placeId: 'addr-1',
      displayName: '1 Rizal Street, Poblacion, Tagbilaran, Bohol, Philippines',
      street: '1 Rizal Street',
      latitude: 9.6496,
      longitude: 123.8854,
      countryCode: 'ph',
    });
  });

  it('calls the Mapbox reverse endpoint with separate lat/lng parameters', async () => {
    // Arrange
    mockFetchOnce(collectionOf(addressProperties));

    // Act
    await reverseGeocode(9.6496, 123.8854);

    // Assert
    const url = lastUrl();
    expect(url.pathname).toBe('/search/geocode/v6/reverse');
    expect(url.searchParams.get('latitude')).toBe('9.6496');
    expect(url.searchParams.get('longitude')).toBe('123.8854');
    expect(url.searchParams.get('access_token')).toBe('pk.test-mobile-token');
  });

  it('falls back to the requested coordinates when there is no match', async () => {
    // Arrange
    mockFetchOnce(collectionOf());

    // Act
    const result = await reverseGeocode(9.5, 123.5);

    // Assert
    expect(result.latitude).toBe(9.5);
    expect(result.longitude).toBe(123.5);
    expect(result.street).toBe('Current location');
    expect(result.displayName).toBe('9.50000, 123.50000');
  });

  it('throws when Mapbox is unreachable', async () => {
    // Arrange
    mockFetchOnce({}, false);

    // Act / Assert
    await expect(reverseGeocode(9.5, 123.5)).rejects.toThrow('Mapbox request failed (500)');
  });
});

describe('searchAddresses', () => {
  it('returns an empty list for a blank query without calling the network', async () => {
    // Arrange / Act
    const results = await searchAddresses('  ');

    // Assert
    expect(results).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('maps Mapbox features to address suggestions', async () => {
    // Arrange
    mockFetchOnce(collectionOf(addressProperties, placeProperties));

    // Act
    const results = await searchAddresses('Rizal');

    // Assert
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      placeId: 'addr-1',
      displayName: '1 Rizal Street, Poblacion, Tagbilaran, Bohol, Philippines',
      latitude: 9.6496,
      longitude: 123.8854,
      countryCode: 'ph',
    });
  });

  it('bounds the search to the Philippines', async () => {
    // Arrange
    mockFetchOnce(collectionOf(addressProperties));

    // Act
    await searchAddresses('Rizal', 4);

    // Assert
    const url = lastUrl();
    expect(url.pathname).toBe('/search/geocode/v6/forward');
    expect(url.searchParams.get('country')).toBe('ph');
    expect(url.searchParams.get('bbox')).toBe('116.9283,4.5873,126.6042,21.3218');
    expect(url.searchParams.get('limit')).toBe('4');
  });

  it('drops features without usable coordinates', async () => {
    // Arrange
    mockFetchOnce(
      collectionOf(
        { mapbox_id: 'broken', full_address: 'Nowhere', coordinates: { latitude: null, longitude: null } },
        addressProperties
      )
    );

    // Act
    const results = await searchAddresses('Rizal');

    // Assert
    expect(results).toHaveLength(1);
    expect(results[0].placeId).toBe('addr-1');
  });

  it('throws when the access token is missing', async () => {
    // Arrange
    delete process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

    // Act / Assert
    await expect(searchAddresses('Rizal')).rejects.toThrow('EXPO_PUBLIC_MAPBOX_TOKEN');
  });
});
