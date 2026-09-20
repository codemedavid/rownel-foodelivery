import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { riderOrdersApi } from '../../../src/lib/riderOrdersApi';
import { nextRiderAction, type RiderAction } from '../../../src/lib/riderActions';
import { openDirections } from '../../../src/lib/mapsLink';
import { openDialer } from '../../../src/lib/phoneLink';
import { statusStyle } from '../../../src/lib/statusColors';
import { formatPeso, colors, radius, spacing } from '../../../src/theme';
import { Badge, Button, EmptyState } from '../../../src/components/ui';

const ACTION_LABEL: Record<RiderAction, string> = {
  pickup: 'Confirm pickup',
  deliver: 'Mark delivered',
};

const ACTION_CONFIRM: Record<RiderAction, string> = {
  pickup: 'Confirm you have collected this order from the merchant?',
  deliver: 'Confirm the customer has received this order?',
};

export default function RiderDeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isViewingAs } = useAuth();
  const [isBusy, setIsBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetcher = useCallback(
    () => (id ? riderOrdersApi.getById(id) : Promise.resolve(null)),
    [id]
  );
  const { data: order, isLoading, error, refetch } = useLiveQuery(fetcher, [id], {
    enabled: !!id,
    realtime: id ? [{ table: 'orders', filter: `id=eq.${id}` }] : [],
  });

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const runAction = useCallback(
    async (action: RiderAction) => {
      if (!order || isViewingAs) return;
      setIsBusy(true);
      try {
        if (action === 'pickup') {
          await riderOrdersApi.markPickedUp(order.id);
          await refetch();
        } else {
          await riderOrdersApi.markDelivered(order.id);
          router.back();
        }
      } catch (err) {
        Alert.alert('Update failed', err instanceof Error ? err.message : 'Please try again.');
      } finally {
        setIsBusy(false);
      }
    },
    [order, isViewingAs, refetch, router]
  );

  const confirmAction = useCallback(
    (action: RiderAction) =>
      Alert.alert(ACTION_LABEL[action], ACTION_CONFIRM[action], [
        { text: 'Cancel', style: 'cancel' },
        { text: ACTION_LABEL[action], onPress: () => void runAction(action) },
      ]),
    [runAction]
  );

  const onNavigate = useCallback(async () => {
    if (!order) return;
    const opened = await openDirections({
      latitude: order.deliveryLatitude,
      longitude: order.deliveryLongitude,
      address: order.address,
    });
    if (!opened) Alert.alert('No destination', 'This order has no delivery address or coordinates.');
  }, [order]);

  const onCall = useCallback(async () => {
    const opened = await openDialer(order?.contactNumber);
    if (!opened) {
      Alert.alert(
        'Cannot place call',
        order?.contactNumber
          ? `This device cannot dial ${order.contactNumber}.`
          : 'This order has no contact number.'
      );
    }
  }, [order]);

  if (!order) {
    return isLoading ? null : (
      <EmptyState emoji="❓" title="Delivery not found" body={error?.message ?? 'It may have been reassigned.'} />
    );
  }

  const style = statusStyle(order.status);
  const action = nextRiderAction(order);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.copy}>
            <Text style={styles.name}>{order.customerName}</Text>
            <Text style={styles.meta}>#{order.id.slice(0, 8).toUpperCase()}</Text>
          </View>
          <Badge label={style.label} color={style.color} backgroundColor={style.background} />
        </View>
        <Text style={styles.address}>{order.address ?? 'No address given'}</Text>
        {order.distanceKm != null && <Text style={styles.meta}>{order.distanceKm.toFixed(1)} km away</Text>}
        <View style={styles.actions}>
          <Button label="Navigate" variant="secondary" onPress={onNavigate} style={styles.action} />
          <Button label="Call" variant="secondary" onPress={onCall} style={styles.action} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Order</Text>
        {order.order_items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemName}>
              {item.quantity}× {item.name}
            </Text>
            <Text style={styles.itemPrice}>{formatPeso(item.subtotal)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.itemRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatPeso(order.total)}</Text>
        </View>
        <Text style={styles.meta}>
          {order.paymentMethod.toUpperCase()}
          {order.deliveryFee != null ? ` · ${formatPeso(order.deliveryFee)} delivery fee` : ''}
        </Text>
        {!!order.notes && <Text style={styles.notes}>“{order.notes}”</Text>}
      </View>

      {action && !isViewingAs && (
        <Button label={ACTION_LABEL[action]} isLoading={isBusy} onPress={() => confirmAction(action)} />
      )}
      {action && isViewingAs && (
        <Text style={styles.meta}>Read-only preview — “{ACTION_LABEL[action]}” is disabled.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  copy: { flex: 1, gap: 2 },
  name: { fontSize: 18, fontWeight: '800', color: colors.text },
  address: { fontSize: 14, color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemName: { fontSize: 14, color: colors.text, flex: 1 },
  itemPrice: { fontSize: 14, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  totalLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  totalValue: { fontSize: 15, fontWeight: '800', color: colors.primary },
  notes: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' },
});
