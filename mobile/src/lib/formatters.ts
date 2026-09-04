const SHORT_ID_LENGTH = 8;

export const shortOrderId = (id: string): string => id.slice(0, SHORT_ID_LENGTH).toUpperCase();

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "just now", "5m ago", "3h ago", "2d ago". */
export const timeAgo = (timestampMs: number, nowMs: number = Date.now()): string => {
  const diff = Math.max(0, nowMs - timestampMs);
  if (diff < MINUTE_MS) return 'just now';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  return `${Math.floor(diff / DAY_MS)}d ago`;
};

export const formatDateTime = (timestampMs: number): string =>
  new Date(timestampMs).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const SERVICE_LABELS: Record<string, string> = {
  delivery: 'Delivery',
  pickup: 'Pickup',
  'dine-in': 'Dine-in',
};

export const serviceTypeLabel = (serviceType: string): string =>
  SERVICE_LABELS[serviceType] ?? serviceType;
