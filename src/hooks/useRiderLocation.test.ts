/**
 * Tests for src/hooks/useRiderLocation.ts
 *
 * Covers:
 *  - disabled → no watchPosition called
 *  - enabled → calls watchPosition, success path calls updateLocation mutation
 *  - throttling (15 s) → two rapid updates → one mutation call
 *  - permission denied → calls setLocationPermission with 'denied'
 *  - cleanup on unmount → clearWatch called
 *
 * NOTE on convex/riders.ts & convex/riderActions.ts:
 *  These files are entirely composed of Convex query/mutation/action/internalQuery
 *  wrappers that import from `convex/_generated/server` and `convex/_generated/api`.
 *  Running them outside a Convex runtime requires either `convex-test` (a
 *  separate package not in package.json) or a heavyweight Convex emulator.
 *  Neither is available in this project, so direct handler tests are SKIPPED.
 *  The pure helper `fetchWithTimeout` and `_verifyAdmin` logic inside those
 *  files are tested indirectly through integration / e2e paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRiderLocation } from './useRiderLocation';

// ─── Mock convex/react ────────────────────────────────────────────────────────

const mockUpdateLocation = vi.fn().mockResolvedValue(undefined);
const mockSetLocationPermission = vi.fn().mockResolvedValue(undefined);

vi.mock('convex/react', () => ({
  useMutation: (ref: unknown) => {
    // Distinguish which mutation is being requested by checking the reference
    // identity stored on the api object.
    const refStr = String(ref);
    if (refStr.includes('setLocationPermission')) return mockSetLocationPermission;
    return mockUpdateLocation;
  },
}));

// Mock the generated api so the useMutation selector strings work.
vi.mock('../../convex/_generated/api', () => ({
  api: {
    riders: {
      updateLocation: 'riders:updateLocation',
      setLocationPermission: 'riders:setLocationPermission',
    },
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
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
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

  it('calls updateLocation mutation on first successful position', async () => {
    let successCb!: PositionCallback;
    getGeoMock().watchPosition.mockImplementation((onSuccess: PositionCallback) => {
      successCb = onSuccess;
      return 2;
    });

    renderHook(() => useRiderLocation(true));

    // Advance time past the 15s throttle window so the first update is sent.
    vi.advanceTimersByTime(20_000);

    await act(async () => {
      successCb(makePosition(14.5995, 120.9842));
      // Allow the microtask queue to flush
      await Promise.resolve();
    });

    expect(mockUpdateLocation).toHaveBeenCalledTimes(1);
    expect(mockUpdateLocation).toHaveBeenCalledWith({
      latitude: 14.5995,
      longitude: 120.9842,
    });
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

  it('throttles updateLocation — two rapid updates produce only one mutation call', async () => {
    let successCb!: PositionCallback;
    getGeoMock().watchPosition.mockImplementation((onSuccess: PositionCallback) => {
      successCb = onSuccess;
      return 4;
    });

    renderHook(() => useRiderLocation(true));

    // Advance past the throttle window for the first call.
    vi.advanceTimersByTime(20_000);

    await act(async () => {
      // First position — should trigger a mutation.
      successCb(makePosition(14.0, 120.0));
      await Promise.resolve();
    });

    // Second position arrives immediately — within the 15 s window.
    await act(async () => {
      successCb(makePosition(14.001, 120.001));
      await Promise.resolve();
    });

    // Only one mutation should have been sent.
    expect(mockUpdateLocation).toHaveBeenCalledTimes(1);
  });

  it('sends a second mutation after the throttle window expires', async () => {
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
    vi.advanceTimersByTime(15_001);

    await act(async () => {
      successCb(makePosition(14.1, 120.1));
      await Promise.resolve();
    });

    expect(mockUpdateLocation).toHaveBeenCalledTimes(2);
  });

  // ─── permission denied ─────────────────────────────────────────────────────

  it('sets permission to "denied" and calls setLocationPermission mutation on PERMISSION_DENIED error', async () => {
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
    expect(mockSetLocationPermission).toHaveBeenCalledWith({ permission: 'denied' });
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
});
