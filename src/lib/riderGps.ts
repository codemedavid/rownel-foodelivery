// Pure GPS decision logic for the rider run, mirroring mobile/src/lib/riderGps.ts
// so both clients treat a fix — and a missing one — the same way.

import type { LocationPermission } from './deliveryTypes';

/** A rider's own fix is shown as stale after a minute without an update. */
export const LOCATION_STALE_MS = 60_000;

/**
 * Dispatch skips any rider whose fix is older than dispatch_settings
 * .location_stale_ms (120s by default), and rider_set_online refuses outright.
 * Re-publishing the last fix this often keeps a parked rider dispatchable —
 * the browser only reports a position when the rider actually moves.
 */
export const LOCATION_HEARTBEAT_MS = 45_000;

/** How often the heartbeat checks whether a re-publish is due. */
export const HEARTBEAT_CHECK_MS = 15_000;

/** A first fix taking longer than this is worth telling the rider about. */
export const GPS_SLOW_SEARCH_MS = 15_000;

export type RiderGpsStatus = 'denied' | 'error' | 'searching' | 'slow' | 'stale' | 'live';

export interface RiderGpsInput {
  permission: LocationPermission;
  hasFix: boolean;
  lastFixAt: number | null;
  error: string | null;
  /** When the current search began, or null once a fix has landed. */
  searchStartedAt: number | null;
  now: number;
}

export const isLocationFresh = (
  lastUpdate: number | null,
  now: number,
  staleMs: number = LOCATION_STALE_MS
): boolean => lastUpdate !== null && now - lastUpdate <= staleMs;

/** What the rider should be told about their GPS right now. */
export const riderGpsStatus = ({
  permission,
  hasFix,
  lastFixAt,
  error,
  searchStartedAt,
  now,
}: RiderGpsInput): RiderGpsStatus => {
  if (permission === 'denied') return 'denied';

  if (!hasFix) {
    if (error) return 'error';
    if (searchStartedAt !== null && now - searchStartedAt >= GPS_SLOW_SEARCH_MS) return 'slow';
    return 'searching';
  }

  // A fix in hand outranks a transient watch error (a timeout between updates
  // is normal): report on the fix's age instead.
  if (!isLocationFresh(lastFixAt, now)) return 'stale';
  return 'live';
};

/** Retrying only helps where the rider is waiting on the sensor, not on settings. */
export const canRetryGps = (status: RiderGpsStatus): boolean =>
  status === 'error' || status === 'slow' || status === 'stale';

/** True when the last fix must be re-published to stay eligible for dispatch. */
export const isHeartbeatDue = (lastSentAt: number, now: number): boolean =>
  now - lastSentAt >= LOCATION_HEARTBEAT_MS;
