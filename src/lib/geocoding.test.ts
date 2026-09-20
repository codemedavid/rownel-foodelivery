import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PHILIPPINES_REGION,
  isWithinPhilippines,
  reverseGeocode,
  suggestAddresses,
} from './geocoding';
import { GeocodingError } from './geocodingError';

const autocomplete = vi.fn();
const reverseLookup = vi.fn();
const loadMapkit = vi.fn();

vi.mock('./mapkit/loadMapkit', () => ({
  loadMapkit: () => loadMapkit(),
}));

/** The slice of the `mapkit` namespace this module touches. */
const mapkitStub = {
  Coordinate: class {
    constructor(
      public latitude: number,
      public longitude: number
    ) {}
  },
  Search: class {
    constructor(public options: unknown) {}
    autocomplete = (...args: unknown[]) => autocomplete(...args);
  },
  Geocoder: class {
    constructor(public options: unknown) {}
    reverseLookup = (...args: unknown[]) => reverseLookup(...args);
  },
};

const autocompleteResult = (overrides: Record<string, unknown> = {}) => ({
  id: 'poi-buko-spot',
  name: 'Buko Spot',
  displayLines: ['Buko Spot', 'Lucena, Quezon'],
  coordinate: { latitude: 13.95260879, longitude: 121.62571486 },
  locality: 'Lucena',
  administrativeArea: 'Quezon',
  countryCode: 'PH',
  ...overrides,
});

const place = (overrides: Record<string, unknown> = {}) => ({
  id: 'place-rizal',
  name: '10 Rizal Street',
  formattedAddress: '10 Rizal Street, Bangued, Abra, Philippines',
  coordinate: { latitude: 17.595814, longitude: 120.617805 },
  fullThoroughfare: '10 Rizal Street',
  thoroughfare: 'Rizal Street',
  subThoroughfare: '10',
  locality: 'Bangued',
  countryCode: 'PH',
  ...overrides,
});

/** Options handed to the most recent autocomplete call. */
const lastAutocompleteOptions = (): Record<string, unknown> => {
  const calls = autocomplete.mock.calls;
  return calls[calls.length - 1][1] as Record<string, unknown>;
};

describe('isWithinPhilippines', () => {
  it('accepts coordinates inside the Philippine bounding box', () => {
    expect(isWithinPhilippines(14.5995, 120.9842)).toBe(true);
  });

  it('rejects coordinates outside the Philippine bounding box', () => {
    expect(isWithinPhilippines(40.748, -73.986)).toBe(false);
  });
});

describe('PHILIPPINES_REGION', () => {
  it('is a centre and span MapKit can use directly', () => {
    expect(PHILIPPINES_REGION.center.latitude).toBeGreaterThan(4.5);
    expect(PHILIPPINES_REGION.center.latitude).toBeLessThan(21.5);
    expect(PHILIPPINES_REGION.span.latitudeDelta).toBeGreaterThan(0);
    expect(PHILIPPINES_REGION.span.longitudeDelta).toBeGreaterThan(0);
  });

  it('covers Manila and excludes Hong Kong', () => {
    const { center, span } = PHILIPPINES_REGION;
    const northEdge = center.latitude + span.latitudeDelta / 2;
    const southEdge = center.latitude - span.latitudeDelta / 2;

    expect(southEdge).toBeLessThan(14.5995);
    expect(northEdge).toBeGreaterThan(14.5995);
    expect(northEdge).toBeLessThan(22.3193);
  });
});

describe('suggestAddresses', () => {
  beforeEach(() => {
    autocomplete.mockReset();
    loadMapkit.mockReset();
    loadMapkit.mockResolvedValue(mapkitStub);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an empty list for a blank query without starting MapKit', async () => {
    // Arrange / Act
    const results = await suggestAddresses('   ');

    // Assert
    expect(results).toEqual([]);
    expect(loadMapkit).not.toHaveBeenCalled();
  });

  it('carries the coordinates through, so no second lookup is needed', async () => {
    // Arrange — unlike Mapbox Search Box, MapKit resolves the pin up front
    autocomplete.mockResolvedValue({ results: [autocompleteResult()] });

    // Act
    const [candidate] = await suggestAddresses('Buko');

    // Assert
    expect(candidate).toMatchObject({
      placeId: 'poi-buko-spot',
      name: 'Buko Spot',
      latitude: 13.95260879,
      longitude: 121.62571486,
    });
  });

  it('builds the label from the display lines MapKit formats for the locale', async () => {
    // Arrange
    autocomplete.mockResolvedValue({ results: [autocompleteResult()] });

    // Act
    const [candidate] = await suggestAddresses('Buko');

    // Assert
    expect(candidate.displayName).toBe('Buko Spot, Lucena, Quezon');
    expect(candidate.context).toBe('Lucena, Quezon');
  });

  it('confines results to the Philippines, where the app delivers', async () => {
    // Arrange
    autocomplete.mockResolvedValue({ results: [autocompleteResult()] });

    // Act
    await suggestAddresses('Buko');

    // Assert
    expect(lastAutocompleteOptions()).toMatchObject({
      limitToCountries: 'PH',
      region: PHILIPPINES_REGION,
    });
  });

  it('biases results toward the supplied proximity point', async () => {
    // Arrange
    autocomplete.mockResolvedValue({ results: [autocompleteResult()] });

    // Act
    await suggestAddresses('Rizal', { proximity: { latitude: 13.9, longitude: 121.6 } });

    // Assert
    expect(lastAutocompleteOptions().coordinate).toEqual({ latitude: 13.9, longitude: 121.6 });
  });

  it('omits the proximity hint when no reference point is known', async () => {
    // Arrange
    autocomplete.mockResolvedValue({ results: [autocompleteResult()] });

    // Act
    await suggestAddresses('Rizal');

    // Assert
    expect(lastAutocompleteOptions()).not.toHaveProperty('coordinate');
  });

  it('drops suggestions with no coordinate, which could never place a pin', async () => {
    // Arrange — MapKit returns bare query completions alongside real places
    autocomplete.mockResolvedValue({
      results: [autocompleteResult(), autocompleteResult({ id: 'q', coordinate: null })],
    });

    // Act
    const results = await suggestAddresses('Buko');

    // Assert
    expect(results).toHaveLength(1);
  });

  it('drops suggestions that land outside the Philippines', async () => {
    // Arrange
    autocomplete.mockResolvedValue({
      results: [
        autocompleteResult(),
        autocompleteResult({
          id: 'abroad',
          coordinate: { latitude: -25.2637, longitude: -57.5759 },
        }),
      ],
    });

    // Act
    const results = await suggestAddresses('Buko');

    // Assert
    expect(results.map((result) => result.placeId)).toEqual(['poi-buko-spot']);
  });

  it('caps the list so the dropdown stays usable on a phone', async () => {
    // Arrange
    autocomplete.mockResolvedValue({
      results: Array.from({ length: 25 }, (_, index) =>
        autocompleteResult({ id: `poi-${index}` })
      ),
    });

    // Act
    const results = await suggestAddresses('Buko', { limit: 8 });

    // Assert
    expect(results).toHaveLength(8);
  });

  it('passes the abort signal so a stale keystroke cancels its request', async () => {
    // Arrange
    autocomplete.mockResolvedValue({ results: [] });
    const controller = new AbortController();

    // Act
    await suggestAddresses('Buko', { signal: controller.signal });

    // Assert
    expect(lastAutocompleteOptions().signal).toBe(controller.signal);
  });

  it('reports a cancelled request as an abort, not a failure to show the customer', async () => {
    // Arrange
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    autocomplete.mockRejectedValue(abortError);

    // Act
    const failure = await suggestAddresses('Buko').catch((error: unknown) => error);

    // Assert
    expect((failure as GeocodingError).kind).toBe('aborted');
  });

  it('reports a MapKit failure as a classified geocoding error', async () => {
    // Arrange
    autocomplete.mockRejectedValue(new Error('network down'));

    // Act
    const failure = await suggestAddresses('Buko').catch((error: unknown) => error);

    // Assert
    expect(failure).toBeInstanceOf(GeocodingError);
  });

  it('passes through the authorisation failure when MapKit never starts', async () => {
    // Arrange — a missing .p8 on the server surfaces here
    loadMapkit.mockRejectedValue(new GeocodingError('auth', 'Apple Maps could not start'));

    // Act
    const failure = await suggestAddresses('Buko').catch((error: unknown) => error);

    // Assert
    expect((failure as GeocodingError).kind).toBe('auth');
  });
});

describe('reverseGeocode', () => {
  beforeEach(() => {
    reverseLookup.mockReset();
    loadMapkit.mockReset();
    loadMapkit.mockResolvedValue(mapkitStub);
  });

  it('builds the street from the house number and street name', async () => {
    // Arrange
    reverseLookup.mockResolvedValue({ results: [place()] });

    // Act
    const result = await reverseGeocode(17.595814, 120.617805);

    // Assert — the rider needs the house number
    expect(result.street).toBe('10 Rizal Street');
    expect(result.displayName).toBe('10 Rizal Street, Bangued, Abra, Philippines');
  });

  it('falls back to the place name when no street detail is available', async () => {
    // Arrange
    reverseLookup.mockResolvedValue({
      results: [place({ fullThoroughfare: null, thoroughfare: null, subThoroughfare: null })],
    });

    // Act
    const result = await reverseGeocode(17.595814, 120.617805);

    // Assert
    expect(result.street).toBe('10 Rizal Street');
  });

  it('labels a pin dropped off-grid with its coordinates rather than failing', async () => {
    // Arrange
    reverseLookup.mockResolvedValue({ results: [] });

    // Act
    const result = await reverseGeocode(17.5, 120.6);

    // Assert
    expect(result).toMatchObject({
      displayName: '17.50000, 120.60000',
      street: 'Current location',
      latitude: 17.5,
      longitude: 120.6,
    });
  });

  it('asks MapKit about the exact coordinate it was given', async () => {
    // Arrange
    reverseLookup.mockResolvedValue({ results: [place()] });

    // Act
    await reverseGeocode(17.5, 120.6);

    // Assert
    expect(reverseLookup).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 17.5, longitude: 120.6 }),
      expect.anything()
    );
  });

  it('keeps the requested coordinates when MapKit answers without one', async () => {
    // Arrange
    reverseLookup.mockResolvedValue({ results: [place({ coordinate: null })] });

    // Act
    const result = await reverseGeocode(17.5, 120.6);

    // Assert
    expect(result).toMatchObject({ latitude: 17.5, longitude: 120.6 });
  });

  it('reports a MapKit failure as a classified geocoding error', async () => {
    // Arrange
    reverseLookup.mockRejectedValue(new Error('service down'));

    // Act / Assert
    await expect(reverseGeocode(17.5, 120.6)).rejects.toBeInstanceOf(GeocodingError);
  });
});
