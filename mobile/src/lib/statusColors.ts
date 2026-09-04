import type { OrderStatus } from './adminTypes';
import { colors } from '../theme';

export interface StatusStyle {
  label: string;
  color: string;
  background: string;
}

export const STATUS_STYLES: Record<OrderStatus, StatusStyle> = {
  pending: { label: 'Pending', color: '#b45309', background: '#fef3c7' },
  confirmed: { label: 'Confirmed', color: '#1d4ed8', background: '#dbeafe' },
  preparing: { label: 'Preparing', color: '#c2410c', background: '#ffedd5' },
  ready: { label: 'Ready', color: colors.success, background: '#dcfce7' },
  out_for_delivery: { label: 'Out for delivery', color: '#7c3aed', background: '#ede9fe' },
  completed: { label: 'Completed', color: colors.textSecondary, background: '#f3f4f6' },
  cancelled: { label: 'Cancelled', color: colors.danger, background: colors.primaryLight },
};

export const statusStyle = (status: string): StatusStyle =>
  STATUS_STYLES[status as OrderStatus] ?? { label: status, color: colors.textSecondary, background: '#f3f4f6' };
