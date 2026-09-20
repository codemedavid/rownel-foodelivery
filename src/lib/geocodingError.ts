// Every address-lookup failure used to surface as the same "could not load
// suggestions" line, which hid the one cause an operator can actually act on:
// a map service that will not authorise. These types keep the cause attached to
// the error so callers can tell a configuration problem (permanent, retrying is
// waste) from an outage or a flaky connection (transient, the next keystroke may
// succeed) — and from a request the app cancelled itself, which is not a failure
// at all.

export type GeocodingErrorKind =
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
  /** HTTP status Mapbox answered with, absent when the request never landed. */
  readonly status?: number;
  /** Mapbox's own message, for the console — never shown to a customer. */
  readonly detail?: string;

  constructor(
    kind: GeocodingErrorKind,
    message: string,
    options: { status?: number; detail?: string; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'GeocodingError';
    // `cause` via the Error constructor needs ES2022; this project targets
    // ES2020, so it is attached directly.
    this.cause = options.cause;
    this.kind = kind;
    this.status = options.status;
    this.detail = options.detail;
  }
}

export const classifyHttpStatus = (status: number): GeocodingErrorKind => {
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) return 'auth';
  if (status === HTTP_TOO_MANY_REQUESTS) return 'rate-limit';
  if (status >= HTTP_SERVER_ERROR_MIN) return 'server';
  return 'unknown';
};

/**
 * True when the map service refuses to authorise this app. Callers should stop
 * searching rather than re-request on every keystroke — nothing the customer
 * types will fix it.
 */
export const isGeocodingConfigError = (error: unknown): boolean =>
  error instanceof GeocodingError && error.kind === 'auth';

/**
 * True when the app cancelled the request itself, because a newer keystroke
 * superseded it. Callers must not show this: nothing went wrong.
 */
export const isAbortError = (error: unknown): boolean =>
  (error instanceof GeocodingError && error.kind === 'aborted') ||
  (error instanceof DOMException && error.name === 'AbortError');

const MESSAGES: Record<GeocodingErrorKind, string> = {
  auth: 'Address search is not configured. Enter your address manually — delivery still works.',
  'rate-limit': 'Too many searches right now. Wait a moment, or enter your address manually.',
  server: 'Address search is temporarily unavailable. You can still enter your address manually.',
  network: 'Check your connection and try again, or enter your address manually.',
  // Never rendered: callers drop aborted requests before they reach the UI.
  aborted: '',
  unknown: 'Could not load suggestions. You can still enter your address manually.',
};

/** The line shown to a customer. Never leaks Mapbox internals. */
export const describeGeocodingError = (error: unknown): string =>
  error instanceof GeocodingError ? MESSAGES[error.kind] : MESSAGES.unknown;

/** Full context for the browser console, where a developer can act on it. */
export const logGeocodingError = (context: string, error: unknown): void => {
  if (isAbortError(error)) return;
  if (error instanceof GeocodingError) {
    console.error(`[geocoding] ${context} failed (${error.kind})`, {
      status: error.status,
      detail: error.detail,
      message: error.message,
    });
    return;
  }
  console.error(`[geocoding] ${context} failed`, error);
};
