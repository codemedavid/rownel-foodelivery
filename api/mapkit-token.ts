// Issues short-lived Apple Maps tokens for MapKit JS — Vercel Edge Function.
//
// MapKit JS authenticates with a JWT signed by the MapKit .p8 private key. That
// key must never reach the browser, so the browser calls this endpoint instead
// and MapKit refreshes through it whenever a token nears expiry.
//
// The endpoint is deliberately unauthenticated: the map and address search are
// shown to signed-out customers browsing merchants. What protects it is the
// `origin` claim baked into every token — a token lifted from this response is
// refused by Apple on any other domain. Set MAPKIT_ORIGIN in production.
//
//   GET /api/mapkit-token  ->  text/plain JWT
//
// Required Vercel project environment variables:
//   MAPKIT_TEAM_ID      10-character Apple Team ID
//   MAPKIT_KEY_ID       10-character MapKit JS key ID
//   MAPKIT_PRIVATE_KEY  full contents of the MapKit JS .p8 file
// Optional:
//   MAPKIT_ORIGIN       bare domain the token is valid for, e.g. row-nel.com

import { buildMapkitToken, MapkitConfigError } from './_lib/mapkitJwt.js';

export const config = { runtime: 'edge' };

// Short enough that a leaked token expires quickly, long enough that a customer
// filling in a delivery address never refreshes mid-flow.
const TOKEN_TTL_SECONDS = 30 * 60;

// The browser may reuse a token for most of its life; the margin leaves time to
// fetch a replacement before the one in hand expires.
const REFRESH_MARGIN_SECONDS = 5 * 60;
const CACHE_SECONDS = TOKEN_TTL_SECONDS - REFRESH_MARGIN_SECONDS;

const APPLE_ID_LENGTH = 10;

// This token is only ever handed to MapKit JS in a browser, so it authorises
// nothing else on the account.
const MAPKIT_JS_SCOPE = 'mapkit_js';

function textResponse(body: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers },
  });
}

/**
 * Both Apple identifiers are exactly 10 characters. Checking here turns a
 * silent 401 from Apple — which surfaces in the browser as a blank map — into a
 * named configuration error in the function logs.
 */
function requireAppleId(value: string | undefined, name: string): string {
  if (!value) {
    throw new MapkitConfigError(`Missing ${name}. Set it in the Vercel project environment.`);
  }
  const trimmed = value.trim();
  if (trimmed.length !== APPLE_ID_LENGTH) {
    throw new MapkitConfigError(
      `${name} must be the ${APPLE_ID_LENGTH}-character identifier from your Apple Developer account.`
    );
  }
  return trimmed;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return textResponse('Method Not Allowed', 405, { Allow: 'GET' });
  }

  try {
    const privateKeyPem = process.env.MAPKIT_PRIVATE_KEY;
    if (!privateKeyPem) {
      throw new MapkitConfigError(
        'Missing MAPKIT_PRIVATE_KEY. Set it in the Vercel project environment.'
      );
    }

    const token = await buildMapkitToken({
      teamId: requireAppleId(process.env.MAPKIT_TEAM_ID, 'MAPKIT_TEAM_ID'),
      keyId: requireAppleId(process.env.MAPKIT_KEY_ID, 'MAPKIT_KEY_ID'),
      privateKeyPem,
      scope: MAPKIT_JS_SCOPE,
      origin: process.env.MAPKIT_ORIGIN?.trim() || undefined,
      ttlSeconds: TOKEN_TTL_SECONDS,
    });

    return textResponse(token, 200, {
      // Per-browser only: a shared cache would hand one origin-pinned token to
      // every visitor and outlive its own expiry.
      'Cache-Control': `private, max-age=${CACHE_SECONDS}`,
    });
  } catch (error) {
    // The message names the missing variable, which only appears in function
    // logs. The browser gets a flat 500 so misconfiguration is not advertised.
    console.error('[mapkit-token] could not issue a Maps token', error);
    return textResponse('Map service unavailable', 500);
  }
}
