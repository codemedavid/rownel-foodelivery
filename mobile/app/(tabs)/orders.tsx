import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCustomerOrders } from '../../src/hooks/useCustomerOrders';
import { isTerminalStatus } from '../../src/lib/orderStatus';
import { describeOrderStatus } from '../../src/lib/orderStatusDisplay';
import { EmptyState, SegmentedControl, StatusPill, type Segment } from '../../src/components/ui';
import { colors, formatPeso, radius, shadows, spacing } from '../../src/theme';
import type { CustomerOrder } from '../../src/lib/customerOrders';

type Filter = 'active' | 'past';

const formatPlacedAt = (placedAt: number): string => {
  if (!placedAt) return '';
  const date = new Date(placedAt);
  const isToday = new Date().toDateString() === date.toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return isToday
    ? `Today · ${time}`
    : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`;
};

const isActiveOrder = (order: CustomerOrder): boolean =>
  !order.status || !isTerminalStatus(order.status);

export default function OrdersScreen() {
  const router = useRouter();
  const { orders, isRefreshing, refresh } = useCustomerOrders();
  const [filter, setFilter] = useState<Filter>('active');

  const active = useMemo(() => orders.filter(isActiveOrder), [orders]);
  const past = useMemo(() => orders.filter((order) => !isActiveOrder(order)), [orders]);
  const visible = filter === 'active' ? active : past;

  const segments: readonly Segment<Filter>[] = [
    { value: 'active', label: 'Active', count: active.length },
    { value: 'past', label: 'Past', count: past.length },
  ];

  if (orders.length === 0) {
    return (
      <View style={styles.centered}>
        <EmptyState
          icon="receipt-outline"
          title="No orders yet"
          body="Orders you place will show up here with their live status."
          actionLabel="Browse restaurants"
          onActionPress={() => router.push('/')}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.filterBar}>
        <SegmentedControl segments={segments} value={filter} onChange={setFilter} />
      </View>

      <FlatList
        data={visible}
        keyExtractor={(entry) => entry.orderId}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={filter === 'active' ? 'checkmark-done-outline' : 'time-outline'}
            title={filter === 'active' ? 'Nothing in progress' : 'No past orders'}
            body={
              filter === 'active'
                ? 'All your orders are wrapped up. Hungry again?'
                : 'Completed and cancelled orders land here.'
            }
          />
        }
        renderItem={({ item }) => <OrderRow order={item} onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.orderId } })} />}
      />
    </View>
  );
}

function OrderRow({ order, onPress }: { order: CustomerOrder; onPress: () => void }) {
  const { color, background, icon } = describeOrderStatus(order.status);
  const isLive = isActiveOrder(order);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Order from ${order.merchantName}, ${formatPeso(order.total)}`}
    >
      <View style={[styles.iconTile, { backgroundColor: background }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>

      <View style={styles.body}>
        <Text style={styles.merchant} numberOfLines={1}>
          {order.merchantName}
        </Text>
        <Text style={styles.reference}>
          #{order.orderId.slice(0, 8).toUpperCase()} · {formatPlacedAt(order.placedAt)}
        </Text>
        <View style={styles.footer}>
          <StatusPill status={order.status} />
          <Text style={styles.total}>{formatPeso(order.total)}</Text>
        </View>
      </View>

      {isLive ? (
        <View style={styles.liveDot} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
  filterBar: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  list: { padding: spacing.lg, gap: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.sm,
  },
  pressed: { opacity: 0.85 },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  merchant: { fontSize: 15.5, fontWeight: '800', color: colors.text },
  reference: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  total: { fontSize: 15, fontWeight: '800', color: colors.text },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: radius.full,
    backgroundColor: colors.success,
  },
});
