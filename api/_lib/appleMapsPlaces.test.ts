// Both search and reverse geocoding read Apple's `Place`, so one mapper shape
// covers both. The tests pin the translation because a swapped coordinate pair
// puts a Philippine address in the Arabian Sea and nothing downstream would
// notice, and because a business row and a plain street row have to render
// differently without either repeating itself.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isWithinPhilippines,
  toAddressCandidate,
  toReverseGeocodeResult,
  type ApplePlace,
} from './appleMapsPlaces.ts';

const MANILA = { latitude: 14.5995, longitude: 120.9842 };

const searchResult = (overrides: Partial<ApplePlace> = {}): ApplePlace => ({
  name: 'Jollibee Rizal Avenue',
  formattedAddressLines: ['Rizal Avenue', 'Santa Cruz', 'Manila'],
  coordinate: { latitude: MANILA.latitude, longitude: MANILA.longitude },
  countryCode: 'PH',
  ...overrides,
});

describe('toAddressCandidate', () => {
  it('reads the coordinate every search result carries', () => {
    // Arrange / Act
    const candidate = toAddressCandidate(searchResult());

    // Assert — this is why /v1/search is used over /v1/searchAutocomplete
    expect(candidate).toMatchObject({
      latitude: MANILA.latitude,
      longitude: MANILA.longitude,
    });
  });

  it('puts the business name in the headline and the address beneath', () => {
    // Arrange / Act
    const candidate = toAddressCandidate(searchResult());

    // Assert
    expect(candidate).toMatchObject({
      name: 'Jollibee Rizal Avenue',
      context: 'Rizal Avenue, Santa Cruz, Manila',
      displayName: 'Jollibee Rizal Avenue, Rizal Avenue, Santa Cruz, Manila',
    });
  });

  it('does not repeat a plain street address as its own context', () => {
    // Arrange — a street result names itself; a business does not
    const street = searchResult({
      name: '1 Rizal Avenue',
      formattedAddressLines: ['1 Rizal Avenue', 'Santa Cruz', 'Manila'],
    });

    // Act
    const candidate = toAddressCandidate(street);

    // Assert
    expect(candidate?.displayName).toBe('1 Rizal Avenue, Santa Cruz, Manila');
    expect(candidate?.context).toBe('Santa Cruz, Manila');
  });

  it('falls back to the first address line when a place has no name', () => {
    // Arrange / Act
    const candidate = toAddressCandidate(searchResult({ name: null }));

    // Assert
    expect(candidate?.name).toBe('Rizal Avenue');
  });

  it('drops a result with no coordinate, which could never place a pin', () => {
    // Arrange / Act / Assert
    expect(toAddressCandidate(searchResult({ coordinate: null }))).toBeNull();
  });

  it('drops a coordinate outside the Philippines', () => {
    // Arrange — Singapore, which a loose query can surface
    const foreign = searchResult({ coordinate: { latitude: 1.3521, longitude: 103.8198 } });

    // Act / Assert
    expect(toAddressCandidate(foreign)).toBeNull();
  });

  it('treats a null coordinate as missing rather than as 0,0', () => {
    // Arrange — Number(null) is 0, which is a real place in the Gulf of Guinea
    const empty = searchResult({ coordinate: { latitude: null, longitude: null } });

    // Act / Assert
    expect(toAddressCandidate(empty)).toBeNull();
  });

  it('drops a result with nothing to label it', () => {
    // Arrange / Act / Assert
    expect(
      toAddressCandidate(searchResult({ name: null, formattedAddressLines: ['  ', null] }))
    ).toBeNull();
  });

  it('lowercases the country code, as the web client does', () => {
    // Arrange / Act / Assert
    expect(toAddressCandidate(searchResult())?.countryCode).toBe('ph');
  });
});

describe('toReverseGeocodeResult', () => {
  const place = (overrides: Partial<ApplePlace> = {}): ApplePlace => ({
    coordinate: { latitude: MANILA.latitude, longitude: MANILA.longitude },
    name: 'Jollibee',
    formattedAddressLines: ['1 Rizal Avenue', 'Santa Cruz', 'Manila'],
    structuredAddress: { fullThoroughfare: '1 Rizal Avenue', thoroughfare: 'Rizal Avenue' },
    countryCode: 'PH',
    ...overrides,
  });

  it('joins the formatted address lines into one display name', () => {
    // Arrange / Act
    const result = toReverseGeocodeResult(place(), MANILA);

    // Assert
    expect(result.displayName).toBe('1 Rizal Avenue, Santa Cruz, Manila');
  });

  it('prefers the full thoroughfare, which keeps the house number', () => {
    // Arrange / Act
    const result = toReverseGeocodeResult(place(), MANILA);

    // Assert — the number is the part a rider needs at the door
    expect(result.street).toBe('1 Rizal Avenue');
  });

  it('composes the street from its parts when there is no full thoroughfare', () => {
    // Arrange
    const withoutFull = place({
      structuredAddress: { subThoroughfare: '12', thoroughfare: 'Mabini Street' },
    });

    // Act / Assert
    expect(toReverseGeocodeResult(withoutFull, MANILA).street).toBe('12 Mabini Street');
  });

  it('lowercases the country code, as the web client does', () => {
    // Arrange / Act
    const result = toReverseGeocodeResult(place(), MANILA);

    // Assert
    expect(result.countryCode).toBe('ph');
  });

  it('labels an unmatched coordinate rather than failing the lookup', () => {
    // Arrange — a pin dropped at sea still has to produce a usable address
    // Act
    const result = toReverseGeocodeResult(undefined, MANILA);

    // Assert
    expect(result).toMatchObject({
      displayName: '14.59950, 120.98420',
      street: 'Current location',
      latitude: MANILA.latitude,
      longitude: MANILA.longitude,
    });
  });

  it('falls back to the requested coordinate when the place has none', () => {
    // Arrange
    const withoutCoordinate = place({ coordinate: null });

    // Act
    const result = toReverseGeocodeResult(withoutCoordinate, MANILA);

    // Assert
    expect(result).toMatchObject({ latitude: MANILA.latitude, longitude: MANILA.longitude });
  });
});

describe('isWithinPhilippines', () => {
  it('accepts a coastal pin just outside the search region', () => {
    // Arrange / Act / Assert — the bounds are deliberately looser than search
    expect(isWithinPhilippines(4.55, 116.95)).toBe(true);
  });

  it('rejects a point in a neighbouring country', () => {
    // Arrange / Act / Assert — Kota Kinabalu
    expect(isWithinPhilippines(5.98, 116.07)).toBe(false);
  });
});
