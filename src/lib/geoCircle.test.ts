import { describe, expect, it } from 'vitest';
import { CIRCLE_SEGMENTS, createCirclePolygon } from './geoCircle';

const RADIUS_KM = 5;
const CENTER_LAT = 17.5965;
const CENTER_LNG = 120.618;

// Haversine, used only to verify the generated ring really sits `radiusKm` away.
const distanceKm = (
  [lngA, latA]: [number, number],
  [lngB, latB]: [number, number]
): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
};

describe('createCirclePolygon', () => {
  it('returns a GeoJSON Polygon feature', () => {
    // Arrange / Act
    const polygon = createCirclePolygon(CENTER_LAT, CENTER_LNG, RADIUS_KM);

    // Assert
    expect(polygon.type).toBe('Feature');
    expect(polygon.geometry.type).toBe('Polygon');
  });

  it('closes the ring by repeating the first point last', () => {
    // Arrange / Act
    const [ring] = createCirclePolygon(CENTER_LAT, CENTER_LNG, RADIUS_KM).geometry
      .coordinates;

    // Assert
    expect(ring).toHaveLength(CIRCLE_SEGMENTS + 1);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('emits coordinates in GeoJSON [longitude, latitude] order', () => {
    // Arrange / Act
    const [ring] = createCirclePolygon(CENTER_LAT, CENTER_LNG, RADIUS_KM).geometry
      .coordinates;

    // Assert — every longitude stays near 120, every latitude near 17
    for (const [lng, lat] of ring) {
      expect(Math.abs(lng - CENTER_LNG)).toBeLessThan(1);
      expect(Math.abs(lat - CENTER_LAT)).toBeLessThan(1);
    }
  });

  it('places every ring point the requested radius from the centre', () => {
    // Arrange / Act
    const [ring] = createCirclePolygon(CENTER_LAT, CENTER_LNG, RADIUS_KM).geometry
      .coordinates;

    // Assert
    for (const point of ring) {
      expect(distanceKm([CENTER_LNG, CENTER_LAT], point)).toBeCloseTo(RADIUS_KM, 1);
    }
  });

  it('scales with the radius', () => {
    // Arrange / Act
    const small = createCirclePolygon(CENTER_LAT, CENTER_LNG, 1).geometry.coordinates[0];
    const large = createCirclePolygon(CENTER_LAT, CENTER_LNG, 10).geometry.coordinates[0];

    // Assert
    expect(distanceKm([CENTER_LNG, CENTER_LAT], small[0])).toBeCloseTo(1, 1);
    expect(distanceKm([CENTER_LNG, CENTER_LAT], large[0])).toBeCloseTo(10, 1);
  });

  it('returns a degenerate ring at the centre for a zero radius', () => {
    // Arrange / Act
    const [ring] = createCirclePolygon(CENTER_LAT, CENTER_LNG, 0).geometry.coordinates;

    // Assert
    for (const [lng, lat] of ring) {
      expect(lng).toBeCloseTo(CENTER_LNG, 6);
      expect(lat).toBeCloseTo(CENTER_LAT, 6);
    }
  });

  it('does not mutate or share the ring between calls', () => {
    // Arrange
    const first = createCirclePolygon(CENTER_LAT, CENTER_LNG, RADIUS_KM);
    const second = createCirclePolygon(CENTER_LAT, CENTER_LNG, RADIUS_KM);

    // Act / Assert
    expect(first).not.toBe(second);
    expect(first.geometry.coordinates[0]).not.toBe(second.geometry.coordinates[0]);
    expect(first).toEqual(second);
  });
});
