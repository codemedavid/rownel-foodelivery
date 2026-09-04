import { isRiderAtCapacity, sortRidersForAssignment } from './riderSorting';
import type { RiderSummary } from './adminTypes';

const rider = (overrides: Partial<RiderSummary>): RiderSummary => ({
  id: 'r',
  name: 'R',
  phone: '',
  plateNumber: '',
  vehicleType: 'motorcycle',
  presenceStatus: 'offline',
  lastLocationUpdate: null,
  activeOrderCount: 0,
  maxOrders: 3,
  ...overrides,
});

describe('sortRidersForAssignment', () => {
  it('orders available, then busy, then offline, breaking ties by load then name', () => {
    const list = [
      rider({ id: 'off', presenceStatus: 'offline' }),
      rider({ id: 'busy2', presenceStatus: 'busy', activeOrderCount: 2 }),
      rider({ id: 'avail1', presenceStatus: 'available', activeOrderCount: 1, name: 'Zed' }),
      rider({ id: 'avail0', presenceStatus: 'available', activeOrderCount: 0, name: 'Amy' }),
      rider({ id: 'availB', presenceStatus: 'available', activeOrderCount: 0, name: 'Bob' }),
    ];
    expect(sortRidersForAssignment(list).map((r) => r.id)).toEqual([
      'avail0',
      'availB',
      'avail1',
      'busy2',
      'off',
    ]);
    expect(list[0].id).toBe('off');
  });
});

describe('isRiderAtCapacity', () => {
  it('flags riders whose active load meets the max', () => {
    expect(isRiderAtCapacity(rider({ activeOrderCount: 3, maxOrders: 3 }))).toBe(true);
    expect(isRiderAtCapacity(rider({ activeOrderCount: 2, maxOrders: 3 }))).toBe(false);
  });
});
