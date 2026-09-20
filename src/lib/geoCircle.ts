// Mapbox GL has no circle-in-metres primitive,
// so a delivery radius is drawn as a GeoJSON polygon approximating the circle.

export const CIRCLE_SEGMENTS = 64;

const EARTH_RADIUS_KM = 6371;
const DEGREES_PER_RADIAN = 180 / Math.PI;

export interface CirclePolygonFeature {
  type: 'Feature';
  properties: Record<string, never>;
  geometry: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
}

const toRadians = (degrees: number): number => degrees / DEGREES_PER_RADIAN;

/**
 * Builds a closed ring of `CIRCLE_SEGMENTS` points sitting `radiusKm` from the
 * centre. Longitude spacing is scaled by cos(latitude) so the shape stays a
 * circle on the ground rather than an ellipse.
 */
export const createCirclePolygon = (
  centerLatitude: number,
  centerLongitude: number,
  radiusKm: number
): CirclePolygonFeature => {
  const latitudeDelta = (radiusKm / EARTH_RADIUS_KM) * DEGREES_PER_RADIAN;
  const longitudeDelta = latitudeDelta / Math.cos(toRadians(centerLatitude));

  const ring = Array.from({ length: CIRCLE_SEGMENTS }, (_, index) => {
    const angle = (index / CIRCLE_SEGMENTS) * 2 * Math.PI;
    return [
      centerLongitude + longitudeDelta * Math.cos(angle),
      centerLatitude + latitudeDelta * Math.sin(angle),
    ] as [number, number];
  });

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      // Copy the closing point rather than aliasing ring[0].
      coordinates: [[...ring, [...ring[0]] as [number, number]]],
    },
  };
};
