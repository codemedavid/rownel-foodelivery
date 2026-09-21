// Request parsing and response shaping shared by the two maps proxy endpoints.
//
// Both handlers take untrusted query strings from a phone, so parsing lives
// here and returns either a value or a named reason — never NaN, never a
// silently coerced 0. `Number('')` is 0 and `Number(null)` is 0, and 0,0 is a
// perfectly valid coordinate in the Gulf of Guinea, so every numeric parameter
// is checked before it is trusted.

import { MapkitConfigError } from './mapkitJwt.js';
import { AppleMapsAuthError } from './appleMapsAccessToken.js';
import { AppleMapsRequestError } from './appleMapsApi.js';
import type { MapPoint } from './appleMapsPlaces.js';

const LATITUDE_MAX = 90;
const LONGITUDE_MAX = 180;

const MAX_QUERY_LENGTH = 200;

const MIN_LIMIT = 1;
const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 10;

const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_BAD_GATEWAY = 502;
const HTTP_SERVER_ERROR = 500;

// The phone may reuse a result for a little while; an address does not move.
// Short enough that a corrected label reaches the next customer quickly.
const CACHE_SECONDS = 60;

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  // The Expo app sends no Origin, but `expo start --web` does. These endpoints
  // expose nothing the map itself does not already show.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const jsonResponse = (
  body: unknown,
  status: number,
  headers: Record<string, string> = {}
): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });

export const okResponse = (body: unknown): Response =>
  jsonResponse(body, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });

export const errorResponse = (message: string, status: number): Response =>
  jsonResponse({ error: message }, status);

export const preflightResponse = (): Response => new Response(null, { status: 204, headers: JSON_HEADERS });

/** A caller-supplied value that failed validation. Safe to echo back. */
export class InvalidParameterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidParameterError';
  }
}

const parseNumber = (raw: string | null, name: string): number => {
  if (raw === null || raw.trim() === '') {
    throw new InvalidParameterError(`Missing ${name}.`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new InvalidParameterError(`${name} must be a number.`);
  }
  return value;
};

/** Reads a lat/lng pair from `lat` and `lng`, rejecting anything off-globe. */
export const readPoint = (params: URLSearchParams): MapPoint => {
  const latitude = parseNumber(params.get('lat'), 'lat');
  const longitude = parseNumber(params.get('lng'), 'lng');

  if (Math.abs(latitude) > LATITUDE_MAX) {
    throw new InvalidParameterError(`lat must be between -${LATITUDE_MAX} and ${LATITUDE_MAX}.`);
  }
  if (Math.abs(longitude) > LONGITUDE_MAX) {
    throw new InvalidParameterError(`lng must be between -${LONGITUDE_MAX} and ${LONGITUDE_MAX}.`);
  }

  return { latitude, longitude };
};

/** The same pair, but optional: absent is fine, half-supplied is not. */
export const readOptionalPoint = (params: URLSearchParams): MapPoint | null => {
  const hasLat = !!params.get('lat')?.trim();
  const hasLng = !!params.get('lng')?.trim();
  if (!hasLat && !hasLng) return null;
  return readPoint(params);
};

export const readQuery = (params: URLSearchParams): string => {
  const query = params.get('q')?.trim() ?? '';
  if (!query) {
    throw new InvalidParameterError('Missing q.');
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new InvalidParameterError(`q must be ${MAX_QUERY_LENGTH} characters or fewer.`);
  }
  return query;
};

export const readLimit = (params: URLSearchParams): number => {
  const raw = params.get('limit');
  if (raw === null || raw.trim() === '') return DEFAULT_LIMIT;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < MIN_LIMIT || value > MAX_LIMIT) {
    throw new InvalidParameterError(`limit must be a whole number from ${MIN_LIMIT} to ${MAX_LIMIT}.`);
  }
  return value;
};

/**
 * Turns whatever went wrong into a response, and logs the part the customer
 * must not see. A misconfigured deployment and a rate-limited account look
 * identical from the phone, but only one of them is worth retrying — so the
 * status distinguishes them even though the message does not.
 */
export const toErrorResponse = (context: string, error: unknown): Response => {
  if (error instanceof InvalidParameterError) {
    return errorResponse(error.message, HTTP_BAD_REQUEST);
  }

  console.error(`[maps] ${context} failed`, error);

  if (error instanceof MapkitConfigError) {
    // Deployment problem. The message names the missing variable and appears
    // only in the function logs; the phone is told nothing it could act on.
    return errorResponse('Map service unavailable', HTTP_SERVER_ERROR);
  }

  if (error instanceof AppleMapsAuthError) {
    return errorResponse('Map service unavailable', HTTP_SERVER_ERROR);
  }

  if (error instanceof AppleMapsRequestError) {
    const status =
      error.status === HTTP_TOO_MANY_REQUESTS ? HTTP_TOO_MANY_REQUESTS : HTTP_BAD_GATEWAY;
    return errorResponse('Map service unavailable', status);
  }

  return errorResponse('Map service unavailable', HTTP_SERVER_ERROR);
};

export const methodNotAllowed = (): Response =>
  jsonResponse({ error: 'Method Not Allowed' }, 405, { Allow: 'GET, OPTIONS' });
