import AsyncStorage from '@react-native-async-storage/async-storage';

export const ORDER_HISTORY_KEY = 'orderHistory';

const MAX_RECORDS = 30;
const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface OrderHistoryRecord {
  orderId: string;
  merchantName: string;
  total: number;
  placedAt: number;
}

/** Orders placed on this device, newest first. Corrupted storage reads as empty. */
export const loadOrderHistory = async (): Promise<OrderHistoryRecord[]> => {
  try {
    const stored = await AsyncStorage.getItem(ORDER_HISTORY_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is OrderHistoryRecord =>
        typeof r?.orderId === 'string' && typeof r?.placedAt === 'number'
    );
  } catch {
    return [];
  }
};

export const appendOrderRecord = async (record: OrderHistoryRecord): Promise<void> => {
  try {
    const existing = await loadOrderHistory();
    const updated = [record, ...existing].slice(0, MAX_RECORDS);
    await AsyncStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // History is best-effort; never block order placement on storage errors.
  }
};

/** Orders recent enough (< 24 h) to still be worth watching for status changes. */
export const activeOrderIds = async (): Promise<string[]> => {
  const history = await loadOrderHistory();
  const now = Date.now();
  return history
    .filter((r) => now - r.placedAt < ACTIVE_WINDOW_MS)
    .map((r) => r.orderId);
};
