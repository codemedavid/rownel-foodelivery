import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useCustomerOrderNotifications } from './useCustomerOrderNotifications';

const mockGetPublicById = vi.fn();
const mockShowNotification = vi.fn();

vi.mock('../lib/deliveryApi', () => ({
  ordersApi: {
    getPublicById: (id: string) => mockGetPublicById(id),
  },
}));

vi.mock('../lib/notificationUtils', () => ({
  showNotification: (...args: unknown[]) => mockShowNotification(...args),
}));

function seedLocalHistory(orderIds: string[]) {
  localStorage.setItem(
    'orderHistory',
    JSON.stringify(
      orderIds.map((orderId) => ({
        orderId,
        merchantName: 'Test Merchant',
        placedAt: Date.now() - 60_000,
      }))
    )
  );
}

function orderWith(id: string, status: string) {
  return { id, status, customerName: 'Juan', total: 100 };
}

describe('useCustomerOrderNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not notify for statuses seen on initial load', async () => {
    seedLocalHistory(['o1']);
    mockGetPublicById.mockResolvedValue(orderWith('o1', 'confirmed'));

    renderHook(() => useCustomerOrderNotifications());

    await waitFor(() => expect(mockGetPublicById).toHaveBeenCalledWith('o1'));
    expect(mockShowNotification).not.toHaveBeenCalled();
  });

  it('notifies when an order transitions to confirmed', async () => {
    seedLocalHistory(['o1']);
    mockGetPublicById.mockResolvedValue(orderWith('o1', 'pending'));

    const { result } = renderHook(() => useCustomerOrderNotifications());
    await waitFor(() => expect(mockGetPublicById).toHaveBeenCalled());

    mockGetPublicById.mockResolvedValue(orderWith('o1', 'confirmed'));
    await act(async () => {
      await result.current.refresh();
    });

    expect(mockShowNotification).toHaveBeenCalledTimes(1);
    expect(String(mockShowNotification.mock.calls[0][0])).toMatch(/confirmed/i);
  });

  it('does not notify again while the status is unchanged', async () => {
    seedLocalHistory(['o1']);
    mockGetPublicById.mockResolvedValue(orderWith('o1', 'pending'));

    const { result } = renderHook(() => useCustomerOrderNotifications());
    await waitFor(() => expect(mockGetPublicById).toHaveBeenCalled());

    mockGetPublicById.mockResolvedValue(orderWith('o1', 'confirmed'));
    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => {
      await result.current.refresh();
    });

    expect(mockShowNotification).toHaveBeenCalledTimes(1);
  });

  it('watches nothing when there is no recent local order history', async () => {
    renderHook(() => useCustomerOrderNotifications());
    await Promise.resolve();
    expect(mockGetPublicById).not.toHaveBeenCalled();
  });

  it('ignores stale history entries older than 24 hours', async () => {
    localStorage.setItem(
      'orderHistory',
      JSON.stringify([
        { orderId: 'old1', placedAt: Date.now() - 25 * 60 * 60 * 1000 },
      ])
    );
    renderHook(() => useCustomerOrderNotifications());
    await Promise.resolve();
    expect(mockGetPublicById).not.toHaveBeenCalled();
  });
});
