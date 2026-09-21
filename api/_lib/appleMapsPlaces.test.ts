// The Server API and MapKit JS name the same fields differently, and the one
// that bites is `location: {lat, lng}` against `coordinate: {latitude,
// longitude}`. These tests pin the translation, because a swapped pair puts a
// Philippine address in the Arabian Sea and nothing downstream would notice.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isWithinPhilippines,
  toAddressCandidate,
  toReverseGeocodeResult,
  type AppleAutocompleteResult,
  type ApplePlace,
} from './appleMapsPlaces.ts';

const MANILA = { latitude: 14.5995, longitude: 120.9842 };

const autocompleteResult = (
  overrides: Partial<AppleAutocompleteResult> = {}
): AppleAutocompleteResult => ({
  completionUrl: '/v1/search?q=Jollibee',
  displayLines: ['Jollibee Rizal Avenue', 'Santa Cruz, Manila'],
  location: { lat: MANILA.latitude, lng: MANILA.longitude },
  ...overrides,
});

describe('toAddressCandidate', () => {
  it('reads the coordinate from Apple’s short lat/lng field names', () => {
    // Arrange
    const result = autocompleteResult();

    // Act
    const candidate = toAddressCandidate(result);

    // Assert
    expect(candidate).toMatchObject({
      latitude: MANILA.latitude,
      longitude: MANILA.longitude,
    });
  });

  it('splits display lines into a headline and a context line', () => {
    // Arrange / Act
    const candidate = toAddressCandidate(autocompleteResult());

    // Assert
    expect(candidate).toMatchObject({
      name: 'Jollibee Rizal Avenue',
      context: 'Santa Cruz, Manila',
      displayName: 'Jollibee Rizal Avenue, Santa Cruz, Manila',
    });
  });

  it('carries the completion URL as the place id', () => {
    // Arrange / Act
    const candidate = toAddressCandidate(autocompleteResult());

    // Assert
    expect(candidate?.placeId).toBe('/v1/search?q=Jollibee');
  });

  it('drops a completion with no coordinate, which could never place a pin', () => {
    // Arrange
    const result = autocompleteResult({ location: null });

    // Act / Assert
    expect(toAddressCandidate(result)).toBeNull();
  });

  it('drops a coordinate outside the Philippines', () => {
    // Arrange — Singapore, which a loose query can surface
    const result = autocompleteResult({ location: { lat: 1.3521, lng: 103.8198 } });

    // Act / Assert
    expect(toAddressCandidate(result)).toBeNull();
  });

  it('treats a null coordinate as missing rather than as 0,0', () => {
    // Arrange — Number(null) is 0, which is a real place in the Gulf of Guinea
    const result = autocompleteResult({ location: { lat: null, lng: null } });

    // Act / Assert
    expect(toAddressCandidate(result)).toBeNull();
  });

  it('drops a completion with no display lines to label it', () => {
    // Arrange
    const result = autocompleteResult({ displayLines: ['  ', null] });

    // Act / Assert
    expect(toAddressCandidate(result)).toBeNull();
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
