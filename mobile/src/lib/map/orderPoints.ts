// Turns a pair of database columns into a map coordinate, or nothing.
//
// Every screen that draws a map reads its coordinates off a row, and every one
// of those rows can have them missing. The two traps this exists to close:
//
//   * Postgres returns numeric columns as strings through PostgREST, so a bare
//     type check rejects a perfectly good coordinate.
//   * Number(null) and Number('') are both 0, and 0,0 is a real place in the
//     Gulf of Guinea — so an order with no coordinates would quietly put a pin
//     off the coast of Africa instead of drawing none.

import type { MapPoint } from './mapEmbedProtocol';

type Coordinate = number | string | null | undefined;

const toFiniteNumber = (value: Coordinate): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** A coordinate pair, or null when either half is missing or unusable. */
export const toMapPoint = (latitude: Coordinate, longitude: Coordinate): MapPoint | null => {
  const lat = toFiniteNumber(latitude);
  const lng = toFiniteNumber(longitude);

  if (lat === null || lng === null) return null;
  // Null Island: far more likely to be two empty columns than a real order.
  if (lat === 0 && lng === 0) return null;

  return { latitude: lat, longitude: lng };
};
