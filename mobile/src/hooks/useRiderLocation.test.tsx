import { act, renderHook, waitFor } from '@testing-library/react-native';

type WatchCallback = (event: { coords: { latitude: number; longitude: number } }) => void;

const mockRequestPermissions = jest.fn();
const mockGetCurrentPosition = jest.fn();
const mockWatchPosition = jest.fn();
const mockRemove = jest.fn();
const mockUpdateLocation = jest.fn();
const mockSetLocationPermission = jest.fn();

let watchCallback: WatchCallback | null = null;

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: () => mockRequestPermissions(),
  getCurrentPositionAsync: (options: unknown) => mockGetCurrentPosition(options),
  watchPositionAsync: (options: unknown, callback: WatchCallback) =>
    mockWatchPosition(options, callback),
}));

jest.mock('../lib/riderPresenceApi', () => ({
  riderPresenceApi: {
    updateLocation: (lat: number, lng: number) => mockUpdateLocation(lat, lng),
    setLocationPermission: (permission: string) => mockSetLocationPermission(permission),
  },
}));

import { useRiderLocation, type RiderLocationTracking } from './useRiderLocation';
import { LOCATION_HEARTBEAT_MS, HEARTBEAT_CHECK_MS } from '../lib/riderGps';

const VIGAN = { latitude: 17.5747, longitude: 120.3869 };

const position = (coords = VIGAN) => ({ coords });

beforeEach(() => {
  jest.clearAllMocks();
  watchCallback = null;
  mockRequestPermissions.mockResolvedValue({ status: 'granted' });
  mockGetCurrentPosition.mockResolvedValue(position());
  mockWatchPosition.mockImplementation((_options: unknown, callback: WatchCallback) => {
    watchCallback = callback;
    return Promise.resolve({ remove: mockRemove });
  });
  mockUpdateLocation.mockResolvedValue(undefined);
  mockSetLocationPermission.mockResolvedValue(undefined);
});

describe('useRiderLocation', () => {
  it('watches GPS while the rider is still offline so they can go online at all', async () => {
    // Arrange / Act
    const { result } = await renderHook(() => useRiderLocation({ enabled: true, publish: false }));

    // Assert
    await waitFor(() => expect(result.current.coords).toEqual(VIGAN));
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    expect(result.current.permission).toBe('granted');
  });

  it('does not write to the server until the rider is on shift', async () => {
    const { result } = await renderHook(() => useRiderLocation({ enabled: true, publish: false }));

    await waitFor(() => expect(result.current.coords).toEqual(VIGAN));
    expect(mockUpdateLocation).not.toHaveBeenCalled();
  });

  it('forces a first fix instead of waiting for the rider to move', async () => {
    // watchPositionAsync never fires here: only getCurrentPositionAsync answers.
    const { result } = await renderHook(() => useRiderLocation({ enabled: true, publish: true }));

    await waitFor(() => expect(result.current.coords).toEqual(VIGAN));
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
    expect(mockUpdateLocation).toHaveBeenCalledWith(VIGAN.latitude, VIGAN.longitude);
  });

  it('republishes the last fix so a standing-still rider stays dispatchable', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useRiderLocation({ enabled: true, publish: true }));

    await waitFor(() => expect(result.current.coords).toEqual(VIGAN));
    expect(mockUpdateLocation).toHaveBeenCalledTimes(1);

    // No movement at all: the watch stays silent past the server's stale window.
    await act(async () => {
      jest.advanceTimersByTime(LOCATION_HEARTBEAT_MS + HEARTBEAT_CHECK_MS);
    });

    expect(mockUpdateLocation).toHaveBeenCalledTimes(2);
    expect(mockUpdateLocation).toHaveBeenLastCalledWith(VIGAN.latitude, VIGAN.longitude);
    jest.useRealTimers();
  });

  it('reports denied permission and never starts a watch', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });

    const { result } = await renderHook(() => useRiderLocation({ enabled: true, publish: true }));

    await waitFor(() => expect(result.current.permission).toBe('denied'));
    expect(mockWatchPosition).not.toHaveBeenCalled();
    expect(mockSetLocationPermission).toHaveBeenCalledWith('denied');
  });

  it('surfaces a failed search and clears it when the rider retries', async () => {
    mockGetCurrentPosition.mockRejectedValueOnce(new Error('Location request timed out'));

    const { result } = await renderHook(() => useRiderLocation({ enabled: true, publish: true }));

    await waitFor(() => expect(result.current.error).toBe('Location request timed out'));
    expect(result.current.coords).toBeNull();

    // Act: the rider taps retry and the sensor answers this time.
    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.coords).toEqual(VIGAN));
    expect(result.current.error).toBeNull();
    expect(mockWatchPosition).toHaveBeenCalledTimes(2);
  });

  it('stays idle and tears down the watch when disabled', async () => {
    const { result, rerender } = await renderHook<RiderLocationTracking, { enabled: boolean }>(
      ({ enabled }) => useRiderLocation({ enabled, publish: false }),
      { initialProps: { enabled: true } }
    );

    await waitFor(() => expect(result.current.coords).toEqual(VIGAN));

    await act(async () => {
      rerender({ enabled: false });
    });

    expect(mockRemove).toHaveBeenCalled();
    expect(result.current.coords).toBeNull();
    expect(result.current.permission).toBe('unknown');
  });

  it('picks up movement reported by the watch', async () => {
    const { result } = await renderHook(() => useRiderLocation({ enabled: true, publish: false }));

    await waitFor(() => expect(watchCallback).not.toBeNull());

    const moved = { latitude: 17.58, longitude: 120.39 };
    await act(async () => {
      watchCallback!({ coords: moved });
    });

    expect(result.current.coords).toEqual(moved);
  });
});
