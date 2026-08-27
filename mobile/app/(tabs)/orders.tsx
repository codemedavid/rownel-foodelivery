import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { loadOrderHistory, type OrderHistoryRecord } from '../../src/lib/orderHistory';
import { useAuth } from '../../src/context/AuthContext';
import { colors, formatPeso, radius, spacing } from '../../src/theme';

interface OrderListEntry {
  orderId: string;
  merchantName: string;
  total: number;
  placedAt: number;
  status?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#b45309' },
  confirmed: { label: 'Confirmed', color: '#1d4ed8' },
  preparing: { label: 'Preparing', color: '#c2410c' },
  ready: { label: 'Ready', color: colors.success },
  out_for_delivery: { label: 'Out for delivery', color: '#b45309' },
  completed: { label: 'Completed', color: colors.textSecondary },
  cancelled: { label: 'Cancelled', color: colors.danger },
};

const mergeAccountOrders = (
  local: OrderListEntry[],
  account: OrderListEntry[]
): OrderListEntry[] => {
  const seen = new Set(local.map((entry) => entry.orderId));
  const merged = [...local];
  for (const entry of account) {
    if (!seen.has(entry.orderId)) merged.push(entry);
  }
  return merged.sort((a, b) => b.placedAt - a.placedAt);
};

export default function OrdersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [entries, setEntries] = useState<OrderListEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    const history = await loadOrderHistory();
    const local: OrderListEntry[] = history.map((record: OrderHistoryRecord) => ({ ...record }));

    let account: OrderListEntry[] = [];
    if (user) {
      try {
        const { data, error } = await supabase.rpc('list_my_orders');
        if (!error && Array.isArray(data)) {
          account = data.map((row: Record<string, unknown>) => ({
            orderId: String(row.id),
            merchantName: 'Your account order',
            total: Number(row.total ?? 0),
            placedAt: row.created_at ? new Date(String(row.created_at)).getTime() : 0,
            status: typeof row.status === 'string' ? row.status : undefined,
          }));
        }
      } catch (err) {
        console.warn('Failed to load account orders:', err);
      }
    }

    const merged = mergeAccountOrders(local, account);

    // Attach live statuses to device orders that don't have one yet.
    const withoutStatus = merged.filter((entry) => !entry.status).slice(0, 10);
    const results = await Promise.allSettled(
      withoutStatus.map((entry) =>
        supabase.rpc('get_order_public', { p_order_id: entry.orderId })
      )
    );
    const statusById = new Map<string, string>();
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && !result.value.error && result.value.data) {
        const row = result.value.data as { status?: string };
        if (row.status) statusById.set(withoutStatus[index].orderId, row.status);
      }
    });

    setEntries(
      merged.map((entry) => ({
        ...entry,
        status: entry.status ?? statusById.get(entry.orderId),
      }))
    );
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  if (entries.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyEmoji}>🧾</Text>
        <Text style={styles.emptyTitle}>No orders yet</Text>
        <Text style={styles.emptyText}>
          Orders you place will show up here with their live status.
        </Text>
        <Pressable style={styles.browseButton} onPress={() => router.push('/')}>
          <Text style={styles.browseText}>Browse restaurants</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      data={entries}
      keyExtractor={(entry) => entry.orderId}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      renderItem={({ item }) => {
        const status = item.status ? STATUS_LABELS[item.status] : undefined;
        return (
          <Pressable
            style={styles.card}
            onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.orderId } })}
            accessibilityRole="button"
          >
            <View style={styles.cardHeader}>
              <Text style={styles.merchant} numberOfLines={1}>
                {item.merchantName}
              </Text>
              {status && (
                <Text style={[styles.status, { color: status.color }]}>{status.label}</Text>
              )}
            </View>
            <View style={styles.cardFooter}>
              <Text style={styles.date}>
                {item.placedAt ? new Date(item.placedAt).toLocaleString() : ''}
              </Text>
              <Text style={styles.total}>{formatPeso(item.total)}</Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: spacing.md },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  browseButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 13,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  browseText: { color: '#fff', fontWeight: '800' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  merchant: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  status: { fontSize: 13, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  date: { fontSize: 12, color: colors.textMuted },
  total: { fontSize: 14, fontWeight: '800', color: colors.primary },
});
