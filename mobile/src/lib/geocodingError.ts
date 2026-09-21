// Ported from the web app's src/lib/geocodingError.ts so both clients classify
// an address-lookup failure the same way.
//
// Every failure used to surface as one "could not load suggestions" line, which
// hid the only cause an operator can act on: a map service that will not
// authorise. Keeping the cause attached lets callers tell a configuration
// problem (permanent — retrying is waste) from an outage or a flaky connection
// (transient — the next keystroke may succeed), and from a request the app
// cancelled itself, which is not a failure at all.

export type GeocodingErrorKind =
  | 'config'
  | 'auth'
  | 'rate-limit'
  | 'server'
  | 'network'
  | 'aborted'
  | 'unknown';

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_MIN = 500;

export class GeocodingError extends Error {
  readonly kind: GeocodingErrorKind;
  /** The underlying failure, when there was one (a rejected fetch, say). */
  readonly cause?: unknown;
  /** HTTP status the proxy answered with; absent when the request never landed. */
  readonly status?: number;

  constructor(
    kind: GeocodingErrorKind,
    message: string,
    options: { status?: number; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'GeocodingError';
    this.kind = kind;
    this.status = options.status;
    this.cause = options.cause;
  }
}

export const classifyHttpStatus = (status: number): GeocodingErrorKind => {
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) return 'auth';
  if (status === HTTP_TOO_MANY_REQUESTS) return 'rate-limit';
  if (status >= HTTP_SERVER_ERROR_MIN) return 'server';
  return 'unknown';
};

/**
 * True when nothing the customer types will help — the app is misconfigured or
 * the map service refuses it. Callers stop searching rather than re-requesting
 * on every keystroke.
 */
export const isGeocodingConfigError = (error: unknown): boolean =>
  error instanceof GeocodingError && (error.kind === 'config' || error.kind === 'auth');

/**
 * True when the app cancelled the request itself, because a newer keystroke
 * superseded it. Callers must not show this: nothing went wrong.
 */
export const isAbortError = (error: unknown): boolean => {
  if (error instanceof GeocodingError) return error.kind === 'aborted';
  return error instanceof Error && error.name === 'AbortError';
};

const MESSAGES: Record<GeocodingErrorKind, string> = {
  config: 'Address search is not set up in this build. Type your address — delivery still works.',
  auth: 'Address search is not configured. Type your address — delivery still works.',
  'rate-limit': 'Too many searches right now. Wait a moment, or type your address.',
  server: 'Address search is temporarily unavailable. You can still type your address.',
  network: 'Check your connection and try again, or type your address.',
  // Never rendered: callers drop aborted requests before they reach the UI.
  aborted: '',
  unknown: 'Could not load suggestions. You can still type your address.',
};

/** The line shown to a customer. Never leaks a status code or an Apple message. */
export const describeGeocodingError = (error: unknown): string =>
  error instanceof GeocodingError ? MESSAGES[error.kind] : MESSAGES.unknown;

/** Full context for the Expo logs, where a developer can act on it. */
export const logGeocodingError = (context: string, error: unknown): void => {
  if (isAbortError(error)) return;
  if (!__DEV__) return;

  if (error instanceof GeocodingError) {
    console.warn(`[geocoding] ${context} failed (${error.kind})`, {
      status: error.status,
      message: error.message,
    });
    return;
  }
  console.warn(`[geocoding] ${context} failed`, error);
};
