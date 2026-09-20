import { mergeAccountOrders, summarizeOrders, type CustomerOrder } from './customerOrders';

const order = (overrides: Partial<CustomerOrder>): CustomerOrder => ({
  orderId: 'o1',
  merchantName: 'Kanto Grill',
  total: 100,
  placedAt: 1,
  ...overrides,
});

describe('mergeAccountOrders', () => {
  test('keeps device orders and adds account-only orders, newest first', () => {
    // Arrange
    const local = [order({ orderId: 'a', placedAt: 10 })];
    const account = [order({ orderId: 'b', placedAt: 30 }), order({ orderId: 'c', placedAt: 20 })];

    // Act
    const merged = mergeAccountOrders(local, account);

    // Assert
    expect(merged.map((o) => o.orderId)).toEqual(['b', 'c', 'a']);
  });

  test('does not duplicate an order present in both sources', () => {
    // Arrange
    const local = [order({ orderId: 'a', merchantName: 'Local name', placedAt: 10 })];
    const account = [order({ orderId: 'a', merchantName: 'Account name', placedAt: 10 })];

    // Act
    const merged = mergeAccountOrders(local, account);

    // Assert
    expect(merged).toHaveLength(1);
    expect(merged[0].merchantName).toBe('Local name');
  });
});

describe('summarizeOrders', () => {
  test('counts orders, sums spend and counts non-terminal orders as active', () => {
    // Arrange
    const orders = [
      order({ orderId: 'a', total: 250, status: 'preparing' }),
      order({ orderId: 'b', total: 150, status: 'completed' }),
      order({ orderId: 'c', total: 100, status: 'cancelled' }),
    ];

    // Act
    const summary = summarizeOrders(orders);

    // Assert
    expect(summary).toEqual({ orderCount: 3, totalSpent: 500, activeCount: 1 });
  });

  test('returns zeroes for an empty history', () => {
    expect(summarizeOrders([])).toEqual({ orderCount: 0, totalSpent: 0, activeCount: 0 });
  });

  test('ignores a non-numeric total instead of producing NaN', () => {
    // Arrange
    const orders = [order({ total: Number.NaN }), order({ orderId: 'b', total: 40 })];

    // Act & Assert
    expect(summarizeOrders(orders).totalSpent).toBe(40);
  });
});
