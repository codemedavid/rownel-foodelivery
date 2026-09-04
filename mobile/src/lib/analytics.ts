import { ORDER_STATUSES, type OrderStatus, type SalesSummary } from './adminTypes';
import type { ServiceType } from '../types';

export type DateRangePreset = 'today' | '7d' | '30d';

const MANILA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PRESET_DAYS: Record<DateRangePreset, number> = { today: 1, '7d': 7, '30d': 30 };

const SERVICE_TYPES: readonly ServiceType[] = ['delivery', 'pickup', 'dine-in'];

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(asRecord) : [];

/** Normalises the admin_sales_summary() jsonb payload into a fully-populated shape. */
export const shapeSalesSummary = (raw: unknown): SalesSummary => {
  const root = asRecord(raw);
  const totals = asRecord(root.totals);
  const counts = asRecord(root.countsByStatus);
  const byService = asRecord(root.byServiceType);

  const countsByStatus = Object.fromEntries(
    ORDER_STATUSES.map((status) => [status, toNumber(counts[status])])
  ) as Record<OrderStatus, number>;

  const byServiceType = Object.fromEntries(
    SERVICE_TYPES.map((type) => {
      const entry = asRecord(byService[type]);
      return [type, { count: toNumber(entry.count), sales: toNumber(entry.sales) }];
    })
  ) as SalesSummary['byServiceType'];

  return {
    totals: {
      grossSales: toNumber(totals.grossSales),
      deliveryFees: toNumber(totals.deliveryFees),
      orderCount: toNumber(totals.orderCount),
      completedCount: toNumber(totals.completedCount),
      cancelledCount: toNumber(totals.cancelledCount),
      avgOrderValue: toNumber(totals.avgOrderValue),
    },
    countsByStatus,
    byServiceType,
    daily: asArray(root.daily).map((d) => ({
      day: String(d.day ?? ''),
      sales: toNumber(d.sales),
      orders: toNumber(d.orders),
      completed: toNumber(d.completed),
    })),
    topItems: asArray(root.topItems).map((i) => ({
      itemId: String(i.itemId ?? ''),
      name: String(i.name ?? ''),
      quantity: toNumber(i.quantity),
      sales: toNumber(i.sales),
    })),
    topMerchants: asArray(root.topMerchants).map((m) => ({
      merchantId: String(m.merchantId ?? ''),
      name: String(m.name ?? ''),
      sales: toNumber(m.sales),
      orders: toNumber(m.orders),
    })),
  };
};

/** Start of the Manila-local day containing `at`, as a UTC Date. */
const manilaDayStart = (at: Date): Date => {
  const shifted = at.getTime() + MANILA_UTC_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
  return new Date(dayStartShifted - MANILA_UTC_OFFSET_MS);
};

export const dateRangePreset = (
  preset: DateRangePreset,
  now: Date = new Date()
): { from: Date; to: Date } => {
  const todayStart = manilaDayStart(now);
  const from = new Date(todayStart.getTime() - (PRESET_DAYS[preset] - 1) * DAY_MS);
  return { from, to: now };
};

export const percentChange = (current: number, previous: number): number | null =>
  previous === 0 ? null : ((current - previous) / previous) * 100;

export const maxOf = (values: readonly number[]): number =>
  values.reduce((max, v) => (v > max ? v : max), 0);
