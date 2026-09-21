// Address autocomplete for the Expo app — Vercel Edge Function.
//
// The browser talks to Apple through MapKit JS directly; a React Native app
// cannot, so it comes here instead and this function calls the Apple Maps
// Server API on its behalf. Results are the same shape MapKit JS returns in
// src/lib/geocoding.ts, so both clients render identical suggestions.
//
//   GET /api/maps-search?q=jollibee&lat=14.6&lng=120.98&limit=10
//   ->  { "results": [{ placeId, name, displayName, context, latitude, longitude }] }
//
// `lat`/`lng` are optional and only bias the ranking toward the phone's last
// GPS fix. Every search is clamped to the Philippines server-side.
//
// Requires the same MAPKIT_TEAM_ID / MAPKIT_KEY_ID / MAPKIT_PRIVATE_KEY the
// browser token endpoint uses. MAPKIT_ORIGIN does not apply: an Apple
// `server_api` token takes no origin claim.

import { autocompleteAddresses } from './_lib/appleMapsApi.js';
import {
  methodNotAllowed,
  okResponse,
  preflightResponse,
  readLimit,
  readOptionalPoint,
  readQuery,
  toErrorResponse,
} from './_lib/mapsRequest.js';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return preflightResponse();
  if (request.method !== 'GET') return methodNotAllowed();

  try {
    const params = new URL(request.url).searchParams;
    const results = await autocompleteAddresses(readQuery(params), {
      proximity: readOptionalPoint(params),
      limit: readLimit(params),
    });

    return okResponse({ results });
  } catch (error: unknown) {
    return toErrorResponse('address autocomplete', error);
  }
}
