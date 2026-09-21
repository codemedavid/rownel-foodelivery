/**
 * Device-local order history. Guests have no account, so the orders placed
 * from this browser are the only way to know what to track and notify about.
 *
 * Writers dispatch ORDER_HISTORY_EVENT so live watchers (notifications, the
 * Orders tab) pick up a new order without a reload.
 */

export const ORDER_HISTORY_KEY = 'orderHistory';
export const ORDER_HISTORY_EVENT = 'rownel:order-history-changed';
export const ACTIVE_ORDER_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY = 30;

export interface LocalOrderItem {
  name: string;
  quantity: number;
  subtotal: number;
}

export interface LocalOrderRecord {
  orderId: string;
  merchantId: string;
  merchantName: string;
  customerName: string;
  contactNumber?: string;
  serviceType?: 'delivery' | 'pickup';
  total: number;
  deliveryFee: number;
  address?: string;
  paymentMethod: string;
  placedAt: number;
  items: LocalOrderItem[];
}

const isRecord = (value: unknown): value is LocalOrderRecord =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as LocalOrderRecord).orderId === 'string' &&
  typeof (value as LocalOrderRecord).placedAt === 'number';

export function readOrderHistory(): LocalOrderRecord[] {
  try {
    const raw = localStorage.getItem(ORDER_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord);
  } catch {
    return [];
  }
}

function writeOrderHistory(records: LocalOrderRecord[]): void {
  try {
    localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(records.slice(0, MAX_HISTORY)));
    window.dispatchEvent(new CustomEvent(ORDER_HISTORY_EVENT));
  } catch (err) {
    console.warn('Could not persist order history:', err);
  }
}

/** Prepends a record (replacing any existing entry with the same id). */
export function addOrderToHistory(record: LocalOrderRecord): LocalOrderRecord[] {
  const others = readOrderHistory().filter((r) => r.orderId !== record.orderId);
  const next = [record, ...others];
  writeOrderHistory(next);
  return next;
}

/** Order ids placed on this device recently enough to still be in flight. */
export function readActiveOrderIds(now: number = Date.now()): string[] {
  return readOrderHistory()
    .filter((r) => now - r.placedAt < ACTIVE_ORDER_WINDOW_MS)
    .map((r) => r.orderId);
}

/** Subscribe to history changes from this tab and other tabs. */
export function subscribeToOrderHistory(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === ORDER_HISTORY_KEY) listener();
  };
  window.addEventListener(ORDER_HISTORY_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(ORDER_HISTORY_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
