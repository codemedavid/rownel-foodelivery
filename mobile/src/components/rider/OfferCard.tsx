import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, formatPeso, radius, spacing } from '../../theme';
import { Button } from '../ui';
import { secondsRemaining } from '../../lib/offerFilters';
import { summarizeItems } from '../../lib/orderItemOptions';
import type { OfferWithOrder } from '../../lib/riderTypes';

interface Props {
  item: OfferWithOrder;
  now: number;
  isBusy: boolean;
  /** Admin preview: the offer is shown but cannot be answered. */
  isReadOnly?: boolean;
  onAccept: (offerId: string) => void;
  onReject: (offerId: string) => void;
}

/** An incoming offer with its live expiry countdown. */
export const OfferCard = ({ item, now, isBusy, isReadOnly = false, onAccept, onReject }: Props) => {
  const { offer, order } = item;
  const seconds = secondsRemaining(offer, now);
  const isUrgent = seconds <= 10;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={styles.merchant}>{order?.customerName ?? 'New delivery'}</Text>
          <Text style={styles.meta}>
            #{offer.orderId.slice(0, 8).toUpperCase()}
            {offer.distanceKm != null ? ` · ${offer.distanceKm.toFixed(1)} km` : ''}
          </Text>
          {!!order?.merchantName && (
            <Text style={styles.meta} numberOfLines={1}>
              From {order.merchantName}
              {order.merchantAddress ? ` · ${order.merchantAddress}` : ''}
            </Text>
          )}
          {!!order?.address && (
            <Text style={styles.meta} numberOfLines={2}>
              To {order.address}
            </Text>
          )}
        </View>
        <View style={[styles.timer, isUrgent && styles.timerUrgent]}>
          <Text style={[styles.timerText, isUrgent && styles.timerTextUrgent]}>{seconds}s</Text>
        </View>
      </View>

      {!!order && order.order_items.length > 0 && (
        <Text style={styles.items} numberOfLines={3}>
          {summarizeItems(order.order_items)}
        </Text>
      )}

      {!!order && (
        <Text style={styles.fee}>
          {formatPeso(order.deliveryFee ?? 0)} delivery fee · {formatPeso(order.total)} order total
        </Text>
      )}

      <View style={styles.actions}>
        <Button
          label="Accept"
          isLoading={isBusy}
          disabled={isReadOnly}
          onPress={() => onAccept(offer.id)}
          style={styles.action}
        />
        <Button
          label="Skip"
          variant="secondary"
          disabled={isBusy || isReadOnly}
          onPress={() => onReject(offer.id)}
          style={styles.action}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  header: { flexDirection: 'row', gap: spacing.md },
  copy: { flex: 1, gap: 2 },
  merchant: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary },
  items: { fontSize: 13, color: colors.text },
  fee: { fontSize: 14, fontWeight: '700', color: colors.primary },
  timer: {
    minWidth: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerUrgent: { backgroundColor: colors.primaryLight },
  timerText: { fontSize: 14, fontWeight: '800', color: '#b45309' },
  timerTextUrgent: { color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
