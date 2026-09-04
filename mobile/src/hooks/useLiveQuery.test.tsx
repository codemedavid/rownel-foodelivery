import { act, renderHook, waitFor } from '@testing-library/react-native';

type Handler = () => void;
type ChannelStub = { on: jest.Mock; subscribe: jest.Mock };

const handlers: Handler[] = [];
const mockRemoveChannel = jest.fn();
const channelStub: ChannelStub = {
  on: jest.fn((_event: string, _filter: unknown, handler: Handler) => {
    handlers.push(handler);
    return channelStub;
  }),
  subscribe: jest.fn(),
};
const mockChannel = jest.fn((_name: string) => channelStub);

jest.mock('../lib/supabase', () => ({
  supabase: {
    channel: (name: string) => mockChannel(name),
    removeChannel: (channel: unknown) => mockRemoveChannel(channel),
  },
}));

import { useLiveQuery } from './useLiveQuery';

beforeEach(() => {
  handlers.length = 0;
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe('useLiveQuery', () => {
  it('fetches on mount and exposes data', async () => {
    const fetcher = jest.fn().mockResolvedValue(['a']);
    const { result } = await renderHook(() => useLiveQuery(fetcher, []));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(['a']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('surfaces fetch errors', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('boom'));
    const { result } = await renderHook(() => useLiveQuery(fetcher, []));
    await waitFor(() => expect(result.current.error?.message).toBe('boom'));
    expect(result.current.data).toBeNull();
  });

  it('debounces realtime events into one refetch', async () => {
    const fetcher = jest.fn().mockResolvedValue(1);
    await renderHook(() =>
      useLiveQuery(fetcher, [], { realtime: [{ table: 'orders', filter: 'merchant_id=eq.m1' }] })
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(channelStub.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'orders', filter: 'merchant_id=eq.m1', event: '*' }),
      expect.any(Function)
    );
    expect(channelStub.subscribe).toHaveBeenCalled();

    await act(async () => {
      handlers.forEach((h) => h());
      handlers.forEach((h) => h());
      jest.advanceTimersByTime(300);
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it('removes the channel on unmount', async () => {
    const fetcher = jest.fn().mockResolvedValue(1);
    const { unmount } = await renderHook(() =>
      useLiveQuery(fetcher, [], { realtime: [{ table: 'orders' }] })
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    await act(async () => {
      await unmount();
    });
    expect(mockRemoveChannel).toHaveBeenCalledWith(channelStub);
  });

  it('skips fetching when disabled', async () => {
    const fetcher = jest.fn().mockResolvedValue(1);
    const { result } = await renderHook(() => useLiveQuery(fetcher, [], { enabled: false }));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(mockChannel).not.toHaveBeenCalled();
  });
});
