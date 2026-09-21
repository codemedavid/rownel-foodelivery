import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useCustomerOrderNotifications } from './useCustomerOrderNotifications';
import { addOrderToHistory } from '../lib/orderHistory';

const mockGetPublicById = vi.fn();
const mockShowNotification = vi.fn();

type BroadcastHandler = (message: { payload: unknown }) => void;
const broadcastHandlers = new Map<string, BroadcastHandler>();
const mockRemoveChannel = vi.fn();

vi.mock('../lib/deliveryApi', () => ({
  ordersApi: {
    getPublicById: (id: string) => mockGetPublicById(id),
  },
}));

vi.mock('../lib/notificationUtils', () => ({
  showNotification: (...args: unknown[]) => mockShowNotification(...args),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    channel: (topic: string) => {
      const channel = {
        on: (_type: string, _filter: unknown, handler: BroadcastHandler) => {
          broadcastHandlers.set(topic, handler);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: (channel: unknown) => mockRemoveChannel(channel),
  },
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

function orderWith(id: string, status: string, assignedRiderId?: string) {
  return { id, status, customerName: 'Juan', total: 100, assignedRiderId };
}

describe('useCustomerOrderNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    broadcastHandlers.clear();
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
    expect(mockShowNotification.mock.calls[0][2]).toEqual({ href: '/track/o1' });
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

  it('starts watching an order placed after the hook mounted (guest, no reload)', async () => {
    mockGetPublicById.mockResolvedValue(orderWith('new1', 'pending'));
    const { result } = renderHook(() => useCustomerOrderNotifications());
    expect(result.current.watchedIds).toEqual([]);

    act(() => {
      addOrderToHistory({
        orderId: 'new1',
        merchantId: 'm1',
        merchantName: 'Test Merchant',
        customerName: 'Juan',
        total: 100,
        deliveryFee: 0,
        paymentMethod: 'gcash',
        placedAt: Date.now(),
        items: [],
      });
    });

    await waitFor(() => expect(mockGetPublicById).toHaveBeenCalledWith('new1'));
    expect(result.current.watchedIds).toEqual(['new1']);
  });

  it('notifies instantly from a realtime broadcast without waiting for a poll', async () => {
    seedLocalHistory(['o1']);
    mockGetPublicById.mockResolvedValue(orderWith('o1', 'pending'));

    renderHook(() => useCustomerOrderNotifications());
    await waitFor(() => expect(broadcastHandlers.has('order:o1')).toBe(true));

    act(() => {
      broadcastHandlers.get('order:o1')?.({
        payload: { orderId: 'o1', status: 'out_for_delivery', assignedRiderId: 'r1', riderName: 'Ben', changedAt: 'now' },
      });
    });

    expect(mockShowNotification).toHaveBeenCalledTimes(1);
    expect(String(mockShowNotification.mock.calls[0][0])).toMatch(/rider on the way/i);
  });

  it('notifies about rider assignment when the status is unchanged', async () => {
    seedLocalHistory(['o1']);
    mockGetPublicById.mockResolvedValue(orderWith('o1', 'ready'));

    renderHook(() => useCustomerOrderNotifications());
    await waitFor(() => expect(broadcastHandlers.has('order:o1')).toBe(true));

    act(() => {
      broadcastHandlers.get('order:o1')?.({
        payload: { orderId: 'o1', status: 'ready', assignedRiderId: 'r1', riderName: 'Ben', changedAt: 'now' },
      });
    });

    expect(mockShowNotification).toHaveBeenCalledTimes(1);
    expect(String(mockShowNotification.mock.calls[0][1])).toMatch(/Ben/);
  });
});
