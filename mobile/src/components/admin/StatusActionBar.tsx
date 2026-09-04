import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Order, StaffOrderStatus } from '../../lib/adminTypes';
import { nextStatusOptions } from '../../lib/orderActions';
import { STATUS_STYLES } from '../../lib/statusColors';
import { spacing } from '../../theme';
import { Button } from '../ui/Button';

interface Props {
  order: Order;
  pendingStatus: StaffOrderStatus | null;
  onSelect: (status: StaffOrderStatus) => void;
}

const ACTION_LABELS: Record<StaffOrderStatus, string> = {
  pending: 'Mark pending',
  confirmed: 'Confirm order',
  preparing: 'Start preparing',
  ready: 'Mark ready',
  completed: 'Mark completed',
  cancelled: 'Cancel order',
};

export const StatusActionBar = ({ order, pendingStatus, onSelect }: Props) => {
  const options = nextStatusOptions(order);
  if (options.length === 0) return null;
  return (
    <View style={styles.row}>
      {options.map((status) => (
        <Button
          key={status}
          label={ACTION_LABELS[status] ?? STATUS_STYLES[status].label}
          variant={status === 'cancelled' ? 'danger' : 'primary'}
          onPress={() => onSelect(status)}
          isLoading={pendingStatus === status}
          disabled={pendingStatus !== null}
          style={styles.button}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  button: { flexGrow: 1, minWidth: 140 },
});
