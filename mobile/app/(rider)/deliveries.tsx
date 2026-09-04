import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useRiderDeliveries } from '../../src/hooks/useRiderDeliveries';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { riderOrdersApi } from '../../src/lib/riderOrdersApi';
import type { Order } from '../../src/lib/adminTypes';
import { colors, spacing } from '../../src/theme';
import { EmptyState, SegmentedControl, type Segment } from '../../src/components/ui';
import { DeliveryCard } from '../../src/components/rider/DeliveryCard';

type Tab = 'active' | 'history';

const LABELS: Record<Tab, string> = { active: 'Active', history: 'Completed' };

export default function RiderDeliveriesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const riderId = user?.id ?? null;
  const [tab, setTab] = useState<Tab>('active');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { deliveries, isLoading: isActiveLoading, error, refetch: refetchActive } = useRiderDeliveries(riderId);

  const historyFetcher = useCallback(
    () => (riderId ? riderOrdersApi.listHistory(riderId) : Promise.resolve([])),
    [riderId]
  );
  const {
    data: history,
    isLoading: isHistoryLoading,
    refetch: refetchHistory,
  } = useLiveQuery(historyFetcher, [riderId], { enabled: !!riderId && tab === 'history' });

  const visible = tab === 'active' ? deliveries : history ?? [];
  const isLoading = tab === 'active' ? isActiveLoading : isHistoryLoading;

  const segments: Segment<Tab>[] = useMemo(
    () => [
      { value: 'active', label: LABELS.active, count: deliveries.length },
      { value: 'history', label: LABELS.history },
    ],
    [deliveries.length]
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await (tab === 'active' ? refetchActive() : refetchHistory());
    setIsRefreshing(false);
  }, [tab, refetchActive, refetchHistory]);

  const openDelivery = useCallback(
    (order: Order) => router.push({ pathname: '/(rider)/delivery/[id]', params: { id: order.id } }),
    [router]
  );

  return (
    <View style={styles.screen}>
      <SegmentedControl segments={segments} value={tab} onChange={setTab} />
      {!!error && <Text style={styles.error}>{error.message}</Text>}
      <FlatList
        data={visible}
        keyExtractor={(order) => order.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => <DeliveryCard order={item} onPress={openDelivery} />}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              emoji={tab === 'active' ? '🛵' : '📦'}
              title={tab === 'active' ? 'Nothing to deliver' : 'No completed deliveries yet'}
              body={tab === 'active' ? 'Accepted orders show up here.' : 'Finished runs are kept here.'}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  error: { color: colors.danger, marginHorizontal: spacing.lg, fontSize: 13 },
});
