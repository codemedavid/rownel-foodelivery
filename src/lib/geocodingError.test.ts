import { describe, expect, it } from 'vitest';
import {
  GeocodingError,
  classifyHttpStatus,
  describeGeocodingError,
  isAbortError,
  isGeocodingConfigError,
} from './geocodingError';

describe('classifyHttpStatus', () => {
  it('treats 401 and 403 as an authentication problem', () => {
    expect(classifyHttpStatus(401)).toBe('auth');
    expect(classifyHttpStatus(403)).toBe('auth');
  });

  it('treats 429 as a rate limit', () => {
    expect(classifyHttpStatus(429)).toBe('rate-limit');
  });

  it('treats 5xx as a Mapbox-side failure', () => {
    expect(classifyHttpStatus(500)).toBe('server');
    expect(classifyHttpStatus(503)).toBe('server');
  });

  it('treats any other rejection as unknown', () => {
    expect(classifyHttpStatus(400)).toBe('unknown');
    expect(classifyHttpStatus(404)).toBe('unknown');
  });
});

describe('isAbortError', () => {
  it('recognises a request the app cancelled itself', () => {
    expect(isAbortError(new GeocodingError('aborted', 'superseded'))).toBe(true);
  });

  it('recognises the DOMException the browser raises on abort', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
  });

  it('does not treat a real failure as an abort', () => {
    expect(isAbortError(new GeocodingError('network', 'offline'))).toBe(false);
  });
});

describe('isGeocodingConfigError', () => {
  it('flags a rejected token, which no retry can fix', () => {
    expect(isGeocodingConfigError(new GeocodingError('auth', 'bad token', { status: 401 }))).toBe(
      true
    );
  });

  it('does not flag transient failures, which a later keystroke may recover from', () => {
    expect(isGeocodingConfigError(new GeocodingError('network', 'offline'))).toBe(false);
    expect(isGeocodingConfigError(new GeocodingError('aborted', 'superseded'))).toBe(false);
    expect(isGeocodingConfigError(new GeocodingError('rate-limit', 'slow down'))).toBe(false);
    expect(isGeocodingConfigError(new GeocodingError('server', 'map service down'))).toBe(false);
  });

  it('does not flag an error from somewhere other than geocoding', () => {
    expect(isGeocodingConfigError(new Error('boom'))).toBe(false);
  });
});

describe('describeGeocodingError', () => {
  it('names the configuration problem when the map service rejects the token', () => {
    const message = describeGeocodingError(new GeocodingError('auth', 'bad', { status: 401 }));

    expect(message).toMatch(/address search is not configured/i);
  });

  it('asks the customer to slow down when rate limited', () => {
    const message = describeGeocodingError(new GeocodingError('rate-limit', 'slow down'));

    expect(message).toMatch(/too many searches/i);
  });

  it('points at the connection when the request never reached Mapbox', () => {
    const message = describeGeocodingError(new GeocodingError('network', 'offline'));

    expect(message).toMatch(/connection/i);
  });

  it('falls back to a manual-entry prompt for anything unrecognised', () => {
    const message = describeGeocodingError(new Error('boom'));

    expect(message).toMatch(/manually/i);
  });
});
