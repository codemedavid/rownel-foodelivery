import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export interface OrderStatusPresentation {
  label: string;
  /** Text/icon colour. */
  color: string;
  /** Pill background. */
  background: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/** Customer-facing journey, in the order the timeline renders it. */
export const CUSTOMER_STATUS_FLOW = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
] as const;

const PRESENTATION: Record<string, OrderStatusPresentation> = {
  pending: {
    label: 'Order placed',
    color: colors.warning,
    background: colors.warningLight,
    icon: 'receipt-outline',
  },
  confirmed: {
    label: 'Confirmed',
    color: colors.info,
    background: colors.infoLight,
    icon: 'checkmark-circle-outline',
  },
  preparing: {
    label: 'Preparing',
    color: colors.accentDark,
    background: colors.accentLight,
    icon: 'flame-outline',
  },
  ready: {
    label: 'Ready',
    color: colors.success,
    background: colors.successLight,
    icon: 'bag-check-outline',
  },
  out_for_delivery: {
    label: 'On the way',
    color: colors.primary,
    background: colors.primaryLight,
    icon: 'bicycle-outline',
  },
  completed: {
    label: 'Delivered',
    color: colors.success,
    background: colors.successLight,
    icon: 'happy-outline',
  },
  cancelled: {
    label: 'Cancelled',
    color: colors.danger,
    background: colors.dangerLight,
    icon: 'close-circle-outline',
  },
};

const UNKNOWN: OrderStatusPresentation = {
  label: 'Processing',
  color: colors.textSecondary,
  background: colors.surfaceSunken,
  icon: 'ellipsis-horizontal',
};

export const describeOrderStatus = (status?: string | null): OrderStatusPresentation =>
  (status ? PRESENTATION[status] : undefined) ?? UNKNOWN;

/** Index of the status inside the customer flow, or -1 when off-flow. */
export const getStatusStepIndex = (status?: string | null): number =>
  CUSTOMER_STATUS_FLOW.findIndex((step) => step === status);
