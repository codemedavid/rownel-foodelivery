// Integration tests for the rider Supabase wrappers. These pin the RPC names,
// table names and filters — the parts that fail silently at runtime rather
// than at compile time. The RPC signatures were also checked against the live
// project (see docs/testing/rider-dashboard.tdd.md).

import { supabase } from './supabase';
import { riderOffersApi } from './riderOffersApi';
import { riderOrdersApi } from './riderOrdersApi';
import { riderPresenceApi } from './riderPresenceApi';
import { riderEarningsApi } from './riderEarningsApi';
import { riderProfileApi } from './riderProfileApi';

jest.mock('./supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

const CHAIN_METHODS = ['select', 'eq', 'not', 'gt', 'in', 'is', 'order', 'limit', 'update', 'maybeSingle'] as const;

interface Chain {
  calls: [string, unknown[]][];
  then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise<unknown>;
  [key: string]: unknown;
}

/** A thenable query builder that records every chained call. */
const makeChain = (result: { data: unknown; error: unknown }): Chain => {
  const calls: [string, unknown[]][] = [];
  const chain = {
    calls,
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  } as Chain;
  for (const method of CHAIN_METHODS) {
    chain[method] = jest.fn((...args: unknown[]) => {
      calls.push([method, args]);
      return chain;
    });
  }
  return chain;
};

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

const argsOf = (chain: Chain, method: string): unknown[][] =>
  chain.calls.filter(([m]) => m === method).map(([, a]) => a);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('riderOffersApi', () => {
  it('lists only this rider\'s pending, unexpired offers with their orders', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await riderOffersApi.listMine('r1');

    expect(mockFrom).toHaveBeenCalledWith('order_offers');
    expect(argsOf(chain, 'select')[0][0]).toBe('*, orders(*, order_items(*))');
    expect(argsOf(chain, 'eq')).toEqual([['rider_id', 'r1'], ['status', 'pending']]);
    expect(argsOf(chain, 'gt')[0][0]).toBe('expires_at');
  });

  it('accepts and rejects through the dispatch RPCs', async () => {
    mockRpc.mockResolvedValue({ data: 'o1', error: null });
    await expect(riderOffersApi.accept('of1')).resolves.toBe('o1');
    expect(mockRpc).toHaveBeenCalledWith('accept_offer', { p_offer_id: 'of1' });

    await riderOffersApi.reject('of1');
    expect(mockRpc).toHaveBeenCalledWith('reject_offer', { p_offer_id: 'of1' });
  });

  it('surfaces the postgres error message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'offer expired' } });
    await expect(riderOffersApi.accept('of1')).rejects.toThrow('offer expired');
  });
});

describe('riderOrdersApi', () => {
  it('scopes active deliveries to this rider and excludes finished ones', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await riderOrdersApi.listActive('r1');

    expect(mockFrom).toHaveBeenCalledWith('orders');
    expect(argsOf(chain, 'eq')).toEqual([['assigned_rider_id', 'r1']]);
    expect(argsOf(chain, 'not')[0]).toEqual(['status', 'in', '("completed","cancelled")']);
  });

  it('lists completed deliveries newest first, bounded', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await riderOrdersApi.listHistory('r1');

    expect(argsOf(chain, 'eq')).toEqual([['assigned_rider_id', 'r1'], ['status', 'completed']]);
    expect(argsOf(chain, 'order')[0]).toEqual(['created_at', { ascending: false }]);
    expect(argsOf(chain, 'limit')[0]).toEqual([50]);
  });

  it('drives the run through the pickup and delivery RPCs', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await riderOrdersApi.markPickedUp('o1');
    expect(mockRpc).toHaveBeenCalledWith('mark_order_picked_up', { p_order_id: 'o1' });

    await riderOrdersApi.markDelivered('o1');
    expect(mockRpc).toHaveBeenCalledWith('mark_order_delivered', { p_order_id: 'o1' });
  });

  it('returns null for a missing order', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));
    await expect(riderOrdersApi.getById('nope')).resolves.toBeNull();
  });

  it('throws when the query fails', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'permission denied' } }));
    await expect(riderOrdersApi.listActive('r1')).rejects.toThrow('permission denied');
  });
});

describe('riderPresenceApi', () => {
  it('reads the rider\'s own presence row', async () => {
    const chain = makeChain({ data: { rider_id: 'r1', status: 'available' }, error: null });
    mockFrom.mockReturnValue(chain);

    const presence = await riderPresenceApi.getMine('r1');

    expect(mockFrom).toHaveBeenCalledWith('rider_presence');
    expect(argsOf(chain, 'eq')[0]).toEqual(['rider_id', 'r1']);
    expect(presence?.status).toBe('available');
  });

  it('calls the presence RPCs with the parameter names the database declares', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await riderPresenceApi.setOnline(true);
    expect(mockRpc).toHaveBeenCalledWith('rider_set_online', { p_online: true });

    await riderPresenceApi.updateLocation(14.5995, 120.9842);
    expect(mockRpc).toHaveBeenCalledWith('rider_update_location', {
      p_latitude: 14.5995,
      p_longitude: 120.9842,
    });

    await riderPresenceApi.setLocationPermission('denied');
    expect(mockRpc).toHaveBeenCalledWith('rider_set_location_permission', { p_permission: 'denied' });
  });
});

describe('riderEarningsApi', () => {
  it('reads the summary RPC for the given rider and zeroes a null payload', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(riderEarningsApi.summary('r1')).resolves.toMatchObject({
      totalEarned: 0,
      todayCount: 0,
    });
    expect(mockRpc).toHaveBeenCalledWith('rider_earnings_summary', { p_rider_id: 'r1' });
  });

  it('lists the rider\'s own payouts newest first', async () => {
    const chain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await riderEarningsApi.listPayouts('r1');

    expect(mockFrom).toHaveBeenCalledWith('payouts');
    expect(argsOf(chain, 'eq')[0]).toEqual(['rider_id', 'r1']);
    expect(argsOf(chain, 'order')[0]).toEqual(['created_at', { ascending: false }]);
  });
});

describe('riderProfileApi', () => {
  it('reads the rider\'s own row', async () => {
    const chain = makeChain({ data: { id: 'r1', name: 'Rider' }, error: null });
    mockFrom.mockReturnValue(chain);

    const profile = await riderProfileApi.getMine('r1');

    expect(mockFrom).toHaveBeenCalledWith('riders');
    expect(argsOf(chain, 'eq')[0]).toEqual(['id', 'r1']);
    expect(profile?.name).toBe('Rider');
  });

  it('stamps updated_at on a profile patch', async () => {
    const chain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    await riderProfileApi.update('r1', { name: 'New Name' });

    const patch = argsOf(chain, 'update')[0][0] as Record<string, unknown>;
    expect(patch.name).toBe('New Name');
    expect(typeof patch.updated_at).toBe('string');
    expect(argsOf(chain, 'eq')[0]).toEqual(['id', 'r1']);
  });
});
