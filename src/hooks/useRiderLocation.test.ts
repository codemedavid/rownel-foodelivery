/**
 * Tests for src/hooks/useRiderLocation.ts
 *
 * Covers:
 *  - disabled → no watchPosition called
 *  - enabled → calls watchPosition, success path calls ridersApi.updateLocation
 *  - throttling (20 s) → two rapid updates → one API call
 *  - permission denied → calls ridersApi.setLocationPermission with 'denied'
 *  - cleanup on unmount → clearWatch called
 *  - first fix seeded via getCurrentPosition, not only on movement
 *  - publish:false → watches without writing to the server
 *  - heartbeat → a parked rider is re-published inside the stale window
 *  - retry() → restarts the watch after a failed search
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRiderLocation } from './useRiderLocation';
import { HEARTBEAT_CHECK_MS, LOCATION_HEARTBEAT_MS } from '../lib/riderGps';

// ─── Mock lib/deliveryApi ─────────────────────────────────────────────────────

const mockUpdateLocation = vi.fn().mockResolvedValue(undefined);
const mockSetLocationPermission = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/deliveryApi', () => ({
  ridersApi: {
    updateLocation: (...args: unknown[]) => mockUpdateLocation(...args),
    setLocationPermission: (...args: unknown[]) => mockSetLocationPermission(...args),
  },
}));

// ─── Geolocation helpers ──────────────────────────────────────────────────────

// setup.ts already installs navigator.geolocation as a mock object.
// We cast it here so we can capture registered callbacks.
function getGeoMock() {
  return navigator.geolocation as {
    watchPosition: ReturnType<typeof vi.fn>;
    clearWatch: ReturnType<typeof vi.fn>;
    getCurrentPosition: ReturnType<typeof vi.fn>;
  };
}

function makePosition(lat: number, lng: number): GeolocationPosition {
  const coords = {
    latitude: lat,
    longitude: lng,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON() { return this; },
  };
  return {
    coords,
    timestamp: Date.now(),
    toJSON() { return this; },
  };
}

function makeGeoError(code: number, message: string): GeolocationPositionError {
  return {
    code,
    message,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useRiderLocation()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUpdateLocation.mockClear();
    mockSetLocationPermission.mockClear();
    getGeoMock().watchPosition.mockClear();
    getGeoMock().clearWatch.mockClear();
    // Default the one-shot seeding read to silence unless a test answers it.
    getGeoMock().getCurrentPosition.mockReset();
    getGeoMock().getCurrentPosition.mockImplementation(() => undefined);
    // Default watchPosition to return id=1 and not invoke callbacks automatically
    getGeoMock().watchPosition.mockReturnValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── disabled ──────────────────────────────────────────────────────────────

  it('does NOT call watchPosition when disabled=false', () => {
    renderHook(() => useRiderLocation(false));
    expect(getGeoMock().watchPosition).not.toHaveBeenCalled();
  });

  it('returns initial state when disabled', () => {
    const { result } = renderHook(() => useRiderLocation(false));
    expect(result.current.permission).toBe('unknown');
    expect(result.current.coords).toBeNull();
    expect(result.current.error).toBeNull();
  });

  // ─── enabled ───────────────────────────────────────────────────────────────

  it('calls watchPosition when enabled=true', () => {
    renderHook(() => useRiderLocation(true));
    expect(getGeoMock().watchPosition).toHaveBeenCalledTimes(1);
  });

  it('calls ridersApi.updateLocation on first successful position', async () => {
    let successCb!: PositionCallback;
    getGeoMock().watchPosition.mockImplementation((onSuccess: PositionCallback) => {
      successCb = onSuccess;
      return 2;
    });

    renderHook(() => useRiderLocation(true));

    // Advance time past the 20s throttle window so the first update is sent.
    vi.advanceTimersByTime(20_000);

    await act(async () => {
      successCb(makePosition(14.5995, 120.9842));
      // Allow the microtask queue to flush
      await Promise.resolve();
    });

    expect(mockUpdateLocation).toHaveBeenCalledTimes(1);
    expect(mockUpdateLocation).toHaveBeenCalledWith(14.5995, 120.9842);
  });

  it('sets state to granted after a successful position', async () => {
    let successCb!: PositionCallback;
    getGeoMock().watchPosition.mockImplementation((onSuccess: PositionCallback) => {
      successCb = onSuccess;
      return 3;
    });

    const { result } = renderHook(() => useRiderLocation(true));

    vi.advanceTimersByTime(20_000);

    await act(async () => {
      successCb(makePosition(14.5, 120.9));
      await Promise.resolve();
    });

    expect(result.current.permission).toBe('granted');
    expect(result.current.coords).toEqual({ latitude: 14.5, longitude: 120.9 });
  });

  // ─── throttling ────────────────────────────────────────────────────────────

  it('throttles updateLocation — two rapid updates produce only one API call', async () => {
    let successCb!: PositionCallback;
    getGeoMock().watchPosition.mockImplementation((onSuccess: PositionCallback) => {
      successCb = onSuccess;
      return 4;
    });

    renderHook(() => useRiderLocation(true));

    // Advance past the throttle window for the first call.
    vi.advanceTimersByTime(20_000);

    await act(async () => {
      // First position — should trigger an update.
      successCb(makePosition(14.0, 120.0));
      await Promise.resolve();
    });

    // Second position arrives immediately — within the 20 s window.
    await act(async () => {
      successCb(makePosition(14.001, 120.001));
      await Promise.resolve();
    });

    // Only one update should have been sent.
    expect(mockUpdateLocation).toHaveBeenCalledTimes(1);
  });

  it('sends a second update after the throttle window expires', async () => {
    let successCb!: PositionCallback;
    getGeoMock().watchPosition.mockImplementation((onSuccess: PositionCallback) => {
      successCb = onSuccess;
      return 5;
    });

    renderHook(() => useRiderLocation(true));

    // First update (past initial throttle window).
    vi.advanceTimersByTime(20_000);

    await act(async () => {
      successCb(makePosition(14.0, 120.0));
      await Promise.resolve();
    });

    expect(mockUpdateLocation).toHaveBeenCalledTimes(1);

    // Advance past another full throttle interval.
    vi.advanceTimersByTime(20_001);

    await act(async () => {
      successCb(makePosition(14.1, 120.1));
      await Promise.resolve();
    });

    expect(mockUpdateLocation).toHaveBeenCalledTimes(2);
  });

  // ─── permission denied ─────────────────────────────────────────────────────

  it('sets permission to "denied" and calls setLocationPermission on PERMISSION_DENIED error', async () => {
    let errorCb!: PositionErrorCallback;
    getGeoMock().watchPosition.mockImplementation(
      (_onSuccess: PositionCallback, onError: PositionErrorCallback) => {
        errorCb = onError;
        return 6;
      },
    );

    const { result } = renderHook(() => useRiderLocation(true));

    await act(async () => {
      errorCb(makeGeoError(1 /* PERMISSION_DENIED */, 'User denied Geolocation'));
      await Promise.resolve();
    });

    expect(result.current.permission).toBe('denied');
    expect(result.current.error).toBe('User denied Geolocation');
    expect(mockSetLocationPermission).toHaveBeenCalledWith('denied');
  });

  it('does NOT call setLocationPermission for non-permission errors', async () => {
    let errorCb!: PositionErrorCallback;
    getGeoMock().watchPosition.mockImplementation(
      (_onSuccess: PositionCallback, onError: PositionErrorCallback) => {
        errorCb = onError;
        return 7;
      },
    );

    const { result } = renderHook(() => useRiderLocation(true));

    await act(async () => {
      errorCb(makeGeoError(3 /* TIMEOUT */, 'Timeout expired'));
      await Promise.resolve();
    });

    expect(result.current.error).toBe('Timeout expired');
    // permission should remain 'unknown' — not changed to 'denied'
    expect(result.current.permission).toBe('unknown');
    expect(mockSetLocationPermission).not.toHaveBeenCalled();
  });

  // ─── cleanup ───────────────────────────────────────────────────────────────

  it('calls clearWatch on unmount', () => {
    getGeoMock().watchPosition.mockReturnValue(99);

    const { unmount } = renderHook(() => useRiderLocation(true));

    unmount();

    expect(getGeoMock().clearWatch).toHaveBeenCalledWith(99);
  });

  it('calls clearWatch when switching from enabled to disabled', () => {
    getGeoMock().watchPosition.mockReturnValue(88);

    const { rerender } = renderHook(({ enabled }) => useRiderLocation(enabled), {
      initialProps: { enabled: true },
    });

    expect(getGeoMock().watchPosition).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });

    expect(getGeoMock().clearWatch).toHaveBeenCalledWith(88);
  });

  // ─── unblocking the rider ──────────────────────────────────────────────────

  it('seeds a first fix from getCurrentPosition instead of waiting for movement', async () => {
    // Arrange: the watch never fires; only the one-shot read answers.
    getGeoMock().getCurrentPosition.mockImplementation((onSuccess: PositionCallback) => {
      onSuccess(makePosition(17.5747, 120.3869));
    });

    // Act
    const { result } = renderHook(() => useRiderLocation(true));
    await act(async () => { await Promise.resolve(); });

    // Assert
    expect(result.current.coords).toEqual({ latitude: 17.5747, longitude: 120.3869 });
    expect(result.current.permission).toBe('granted');
  });

  it('watches without writing to the server while publish is off', async () => {
    getGeoMock().getCurrentPosition.mockImplementation((onSuccess: PositionCallback) => {
      onSuccess(makePosition(17.5747, 120.3869));
    });

    const { result } = renderHook(() => useRiderLocation(true, { publish: false }));
    vi.advanceTimersByTime(20_000);
    await act(async () => { await Promise.resolve(); });

    expect(result.current.coords).not.toBeNull();
    expect(mockUpdateLocation).not.toHaveBeenCalled();
  });

  it('re-publishes the last fix so a standing-still rider stays dispatchable', async () => {
    getGeoMock().getCurrentPosition.mockImplementation((onSuccess: PositionCallback) => {
      onSuccess(makePosition(17.5747, 120.3869));
    });

    renderHook(() => useRiderLocation(true));
    await act(async () => { await Promise.resolve(); });
    expect(mockUpdateLocation).toHaveBeenCalledTimes(1);

    // No movement at all: the watch stays silent past the server's stale window.
    await act(async () => {
      vi.advanceTimersByTime(LOCATION_HEARTBEAT_MS + HEARTBEAT_CHECK_MS);
      await Promise.resolve();
    });

    expect(mockUpdateLocation).toHaveBeenCalledTimes(2);
    expect(mockUpdateLocation).toHaveBeenLastCalledWith(17.5747, 120.3869);
  });

  it('surfaces a failed search and restarts the watch on retry', async () => {
    getGeoMock().getCurrentPosition.mockImplementation((_s: PositionCallback, onError: PositionErrorCallback) => {
      onError(makeGeoError(3, 'Timeout expired'));
    });

    const { result } = renderHook(() => useRiderLocation(true));
    await act(async () => { await Promise.resolve(); });

    expect(result.current.error).toBe('Timeout expired');
    expect(result.current.coords).toBeNull();

    // Act: the rider taps retry and the browser answers this time.
    getGeoMock().getCurrentPosition.mockImplementation((onSuccess: PositionCallback) => {
      onSuccess(makePosition(17.5747, 120.3869));
    });
    await act(async () => {
      result.current.retry();
      await Promise.resolve();
    });

    expect(result.current.coords).toEqual({ latitude: 17.5747, longitude: 120.3869 });
    expect(result.current.error).toBeNull();
    expect(getGeoMock().watchPosition).toHaveBeenCalledTimes(2);
  });

  it('ignores a timeout that arrives after a good fix', async () => {
    let errorCb!: PositionErrorCallback;
    getGeoMock().watchPosition.mockImplementation((_s: PositionCallback, onError: PositionErrorCallback) => {
      errorCb = onError;
      return 7;
    });
    getGeoMock().getCurrentPosition.mockImplementation((onSuccess: PositionCallback) => {
      onSuccess(makePosition(17.5747, 120.3869));
    });

    const { result } = renderHook(() => useRiderLocation(true));
    await act(async () => { await Promise.resolve(); });

    await act(async () => { errorCb(makeGeoError(3, 'Timeout expired')); });

    expect(result.current.error).toBeNull();
    expect(result.current.coords).toEqual({ latitude: 17.5747, longitude: 120.3869 });
  });
});
