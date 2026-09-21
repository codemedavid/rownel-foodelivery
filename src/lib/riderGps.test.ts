import { describe, it, expect } from 'vitest';
import {
  GPS_SLOW_SEARCH_MS,
  LOCATION_HEARTBEAT_MS,
  LOCATION_STALE_MS,
  canRetryGps,
  isHeartbeatDue,
  isLocationFresh,
  riderGpsStatus,
} from './riderGps';

const base = {
  permission: 'granted' as const,
  hasFix: true,
  lastFixAt: 1_000,
  error: null,
  searchStartedAt: null,
  now: 1_000,
};

describe('riderGpsStatus', () => {
  it('reports denied whenever permission was refused, fix or not', () => {
    expect(riderGpsStatus({ ...base, permission: 'denied' })).toBe('denied');
    expect(riderGpsStatus({ ...base, permission: 'denied', hasFix: false })).toBe('denied');
  });

  it('reports searching while the first fix is still being acquired', () => {
    // Arrange
    const input = { ...base, hasFix: false, lastFixAt: null, searchStartedAt: 1_000, now: 2_000 };

    // Act
    const status = riderGpsStatus(input);

    // Assert
    expect(status).toBe('searching');
  });

  it('reports slow once the search has run longer than the slow threshold', () => {
    const input = {
      ...base,
      hasFix: false,
      lastFixAt: null,
      searchStartedAt: 1_000,
      now: 1_000 + GPS_SLOW_SEARCH_MS,
    };

    expect(riderGpsStatus(input)).toBe('slow');
  });

  it('reports error when the search failed before any fix arrived', () => {
    const input = { ...base, hasFix: false, lastFixAt: null, error: 'Position unavailable' };

    expect(riderGpsStatus(input)).toBe('error');
  });

  it('keeps reporting live when a transient error follows a good fix', () => {
    expect(riderGpsStatus({ ...base, error: 'Timeout expired' })).toBe('live');
  });

  it('reports stale once the last fix is older than the stale window', () => {
    const input = { ...base, now: 1_000 + LOCATION_STALE_MS + 1 };

    expect(riderGpsStatus(input)).toBe('stale');
  });
});

describe('canRetryGps', () => {
  it('offers a retry for the states a rider can act on', () => {
    expect(canRetryGps('error')).toBe(true);
    expect(canRetryGps('slow')).toBe(true);
    expect(canRetryGps('stale')).toBe(true);
  });

  it('does not offer a retry while things are working or blocked in settings', () => {
    expect(canRetryGps('live')).toBe(false);
    expect(canRetryGps('searching')).toBe(false);
    expect(canRetryGps('denied')).toBe(false);
  });
});

describe('isLocationFresh', () => {
  it('treats a fix inside the stale window as fresh', () => {
    expect(isLocationFresh(1_000, 1_000 + LOCATION_STALE_MS)).toBe(true);
  });

  it('treats an older fix, or no fix at all, as not fresh', () => {
    expect(isLocationFresh(1_000, 1_000 + LOCATION_STALE_MS + 1)).toBe(false);
    expect(isLocationFresh(null, 1_000)).toBe(false);
  });
});

describe('isHeartbeatDue', () => {
  it('is due once nothing has been published for a heartbeat interval', () => {
    expect(isHeartbeatDue(1_000, 1_000 + LOCATION_HEARTBEAT_MS)).toBe(true);
  });

  it('is not due while a recent write already keeps the rider dispatchable', () => {
    expect(isHeartbeatDue(1_000, 1_000 + LOCATION_HEARTBEAT_MS - 1)).toBe(false);
  });

  it('is due when nothing has ever been published', () => {
    // lastSentAt starts at 0, so any real clock is far past the interval.
    expect(isHeartbeatDue(0, Date.now())).toBe(true);
  });
});
