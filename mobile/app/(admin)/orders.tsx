import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useStaffOrders } from '../../src/hooks/useStaffOrders';
import { useMerchants } from '../../src/hooks/useMerchants';
import type { Order } from '../../src/lib/adminTypes';
import { bucketForStatus, filterOrders, sortNewestFirst, type OrderBucket } from '../../src/lib/orderFilters';
import { colors, spacing } from '../../src/theme';
import { EmptyState, SegmentedControl, type Segment } from '../../src/components/ui';
import { OrderCard } from '../../src/components/admin/OrderCard';

const BUCKETS: readonly OrderBucket[] = ['active', 'ready', 'completed', 'cancelled'];
const BUCKET_LABELS: Record<OrderBucket, string> = {
  all: 'All',
  active: 'Active',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const ALL_MERCHANTS = '__all__';

export default function StaffOrdersScreen() {
  const router = useRouter();
  const { roleContext } = useAuth();
  const { orders, isLoading, error, refetch } = useStaffOrders(roleContext);
  const { merchants } = useMerchants();
  const [bucket, setBucket] = useState<OrderBucket>('active');
  const [merchantId, setMerchantId] = useState<string>(ALL_MERCHANTS);
  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const merchantNames = useMemo(
    () => new Map(merchants.map((m) => [m.id, m.name])),
    [merchants]
  );

  const visibleMerchants = useMemo(() => {
    const ids = new Set(orders.map((o) => o.merchantId));
    return merchants.filter((m) => ids.has(m.id));
  }, [merchants, orders]);

  const counts = useMemo(() => {
    const scoped = merchantId === ALL_MERCHANTS ? orders : orders.filter((o) => o.merchantId === merchantId);
    return scoped.reduce<Record<string, number>>((acc, order) => {
      const key = bucketForStatus(order.status);
      return { ...acc, [key]: (acc[key] ?? 0) + 1 };
    }, {});
  }, [orders, merchantId]);

  const visible = useMemo(
    () =>
      sortNewestFirst(
        filterOrders(orders, {
          bucket,
          merchantId: merchantId === ALL_MERCHANTS ? undefined : merchantId,
          search,
        })
      ),
    [orders, bucket, merchantId, search]
  );

  const segments: Segment<OrderBucket>[] = BUCKETS.map((value) => ({
    value,
    label: BUCKET_LABELS[value],
    count: counts[value] ?? 0,
  }));

  const merchantSegments: Segment<string>[] = [
    { value: ALL_MERCHANTS, label: 'All merchants' },
    ...visibleMerchants.map((m) => ({ value: m.id, label: m.name })),
  ];

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const openOrder = useCallback(
    (order: Order) => router.push({ pathname: '/(admin)/order/[id]', params: { id: order.id } }),
    [router]
  );

  return (
    <View style={styles.screen}>
      <TextInput
        style={styles.search}
        placeholder="Search name, phone or order #"
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
      <SegmentedControl segments={segments} value={bucket} onChange={setBucket} />
      {visibleMerchants.length > 1 && (
        <SegmentedControl segments={merchantSegments} value={merchantId} onChange={setMerchantId} />
      )}
      {error && <Text style={styles.error}>{error.message}</Text>}
      <FlatList
        data={visible}
        keyExtractor={(order) => order.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            merchantName={roleContext.isAdmin || visibleMerchants.length > 1 ? merchantNames.get(item.merchantId) : undefined}
            onPress={openOrder}
          />
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              emoji="🧾"
              title={`No ${BUCKET_LABELS[bucket].toLowerCase()} orders`}
              body="New orders appear here instantly."
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  search: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  error: { color: colors.danger, marginHorizontal: spacing.lg, fontSize: 13 },
});
