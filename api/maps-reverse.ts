// Reverse geocoding for the Expo app — Vercel Edge Function.
//
// Turns a GPS fix or a dropped pin into the street-level address a rider can
// actually find. Expo's on-device reverse geocoder usually omits the house
// number, which is the one part that matters at the door, so the app asks here
// first and falls back to the device only if this is unreachable.
//
//   GET /api/maps-reverse?lat=14.5995&lng=120.9842
//   ->  { placeId, displayName, street, latitude, longitude, countryCode }
//
// A coordinate with no match is not an error: the response carries a
// coordinate label so an off-grid pin is still usable.

import { reverseGeocodePoint } from './_lib/appleMapsApi.js';
import {
  methodNotAllowed,
  okResponse,
  preflightResponse,
  readPoint,
  toErrorResponse,
} from './_lib/mapsRequest.js';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return preflightResponse();
  if (request.method !== 'GET') return methodNotAllowed();

  try {
    const params = new URL(request.url).searchParams;
    const result = await reverseGeocodePoint(readPoint(params));

    return okResponse(result);
  } catch (error: unknown) {
    return toErrorResponse('reverse geocode', error);
  }
}
