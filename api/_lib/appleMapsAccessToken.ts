// Exchanges our signed JWT for an Apple Maps Server API access token.
//
// Two tokens are involved and they are easy to confuse:
//
//   1. The *auth* token — an ES256 JWT we sign here with the .p8 key. Claims
//      are iss/iat/exp plus `scope: "server_api"`. No `origin`: that claim only
//      applies to the browser frameworks, and Apple rejects nothing for its
//      absence here.
//   2. The *access* token — what Apple hands back from /v1/token in exchange
//      for (1), and the only thing the search and geocode endpoints accept.
//
// The access token lasts ~30 minutes and is the same for every caller, so it is
// cached in module scope. On Vercel that means one exchange per warm instance
// rather than one per customer keystroke, which matters: the exchange itself
// counts against the daily service-call quota.
//
// Nothing here may be imported from `src/` — Vite would inline the private key
// into the browser bundle.

import { buildMapkitToken, MapkitConfigError } from './mapkitJwt.js';

const TOKEN_URL = 'https://maps-api.apple.com/v1/token';

/** Apple's own scope string for the Server API. Anything else is refused. */
const SERVER_API_SCOPE = 'server_api';

// The auth token is presented once, immediately. It never needs to outlive the
// round trip, so a short life limits what a leaked one could do.
const AUTH_TOKEN_TTL_SECONDS = 5 * 60;

// Renew this far before Apple's stated expiry, so a request that starts just
// under the wire cannot land just over it.
const RENEWAL_MARGIN_SECONDS = 60;

const APPLE_ID_LENGTH = 10;

const REQUEST_TIMEOUT_MS = 8000;

interface TokenResponse {
  accessToken?: string;
  expiresInSeconds?: number;
}

interface CachedToken {
  accessToken: string;
  /** Epoch milliseconds after which this token must not be reused. */
  expiresAtMs: number;
}

let cached: CachedToken | null = null;
// Concurrent requests on a cold instance share one exchange instead of racing.
let inFlight: Promise<string> | null = null;

/**
 * Both Apple identifiers are exactly 10 characters. Checking here turns a
 * silent 401 from Apple into a named configuration error in the function logs.
 */
const requireAppleId = (value: string | undefined, name: string): string => {
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
};

const requirePrivateKey = (): string => {
  const privateKeyPem = process.env.MAPKIT_PRIVATE_KEY;
  if (!privateKeyPem) {
    throw new MapkitConfigError(
      'Missing MAPKIT_PRIVATE_KEY. Set it in the Vercel project environment.'
    );
  }
  return privateKeyPem;
};

/** The failure Apple's /v1/token answered with, with its status preserved. */
export class AppleMapsAuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AppleMapsAuthError';
    this.status = status;
  }
}

const exchange = async (): Promise<string> => {
  const authToken = await buildMapkitToken({
    teamId: requireAppleId(process.env.MAPKIT_TEAM_ID, 'MAPKIT_TEAM_ID'),
    keyId: requireAppleId(process.env.MAPKIT_KEY_ID, 'MAPKIT_KEY_ID'),
    privateKeyPem: requirePrivateKey(),
    scope: SERVER_API_SCOPE,
    ttlSeconds: AUTH_TOKEN_TTL_SECONDS,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AppleMapsAuthError(
      `Apple refused the Maps auth token (${response.status}) ${detail}`.trim(),
      response.status
    );
  }

  const body = (await response.json()) as TokenResponse;
  const accessToken = body.accessToken?.trim();
  if (!accessToken) {
    throw new AppleMapsAuthError('Apple returned an empty Maps access token', response.status);
  }

  const lifetime = Math.max(
    0,
    (body.expiresInSeconds ?? 0) - RENEWAL_MARGIN_SECONDS
  );
  cached = { accessToken, expiresAtMs: Date.now() + lifetime * 1000 };

  return accessToken;
};

/**
 * A Maps access token, reused until it nears expiry. Throws
 * {@link MapkitConfigError} when the deployment is misconfigured and
 * {@link AppleMapsAuthError} when Apple refuses to issue one.
 */
export const getAppleMapsAccessToken = async (): Promise<string> => {
  if (cached && cached.expiresAtMs > Date.now()) return cached.accessToken;

  // A failed exchange is not cached, so the next request retries cleanly.
  if (!inFlight) {
    inFlight = exchange().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
};

/** Drops the cached token. Exists so tests start from a cold instance. */
export const resetAppleMapsAccessTokenForTests = (): void => {
  cached = null;
  inFlight = null;
};
