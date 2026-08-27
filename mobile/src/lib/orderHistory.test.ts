import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  appendOrderRecord,
  loadOrderHistory,
  activeOrderIds,
  ORDER_HISTORY_KEY,
  type OrderHistoryRecord,
} from './orderHistory';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const record = (overrides: Partial<OrderHistoryRecord> = {}): OrderHistoryRecord => ({
  orderId: 'o1',
  merchantName: 'Test Merchant',
  total: 250,
  placedAt: Date.now(),
  ...overrides,
});

describe('orderHistory', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns an empty list when nothing is stored', async () => {
    expect(await loadOrderHistory()).toEqual([]);
  });

  it('appends records newest-first and persists them', async () => {
    await appendOrderRecord(record({ orderId: 'o1' }));
    await appendOrderRecord(record({ orderId: 'o2' }));

    const history = await loadOrderHistory();
    expect(history.map((r) => r.orderId)).toEqual(['o2', 'o1']);
  });

  it('caps stored history at 30 records', async () => {
    for (let i = 0; i < 35; i += 1) {
      await appendOrderRecord(record({ orderId: `o${i}` }));
    }
    expect((await loadOrderHistory())).toHaveLength(30);
  });

  it('recovers from corrupted storage instead of throwing', async () => {
    await AsyncStorage.setItem(ORDER_HISTORY_KEY, 'not-json{');
    expect(await loadOrderHistory()).toEqual([]);
    await expect(appendOrderRecord(record())).resolves.not.toThrow();
  });

  it('activeOrderIds returns only orders placed within the last 24 hours', async () => {
    await appendOrderRecord(record({ orderId: 'fresh', placedAt: Date.now() - 60_000 }));
    await appendOrderRecord(
      record({ orderId: 'stale', placedAt: Date.now() - 25 * 60 * 60 * 1000 })
    );

    expect(await activeOrderIds()).toEqual(['fresh']);
  });
});
