import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { adminRidersApi } from '../../src/lib/adminRidersApi';
import { viewAsTargetFromRider } from '../../src/lib/viewAs';
import type { RiderRecord } from '../../src/lib/adminTypes';
import { timeAgo } from '../../src/lib/formatters';
import { colors, radius, spacing } from '../../src/theme';
import { Badge, Button, EmptyState } from '../../src/components/ui';

const PRESENCE_COLORS = {
  available: { color: colors.success, bg: '#dcfce7' },
  busy: { color: '#b45309', bg: '#fef3c7' },
  offline: { color: colors.textSecondary, bg: '#f3f4f6' },
} as const;

export default function RidersScreen() {
  const router = useRouter();
  const { roleContext, startViewAs } = useAuth();
  const fetcher = useCallback(
    async () => {
      const [riders, presence] = await Promise.all([adminRidersApi.listAll(), adminRidersApi.listPresence()]);
      return { riders, presence: new Map(presence.map((p) => [p.riderId, p])) };
    },
    []
  );
  const { data, isLoading, error, refetch } = useLiveQuery(fetcher, [], {
    enabled: roleContext.isAdmin,
    realtime: [{ table: 'riders' }, { table: 'rider_presence' }],
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const riders = useMemo(() => data?.riders ?? [], [data]);

  const run = useCallback(
    async (rider: RiderRecord, action: () => Promise<void>) => {
      setBusyId(rider.id);
      try {
        await action();
        await refetch();
      } catch (err) {
        Alert.alert('Update failed', err instanceof Error ? err.message : 'Please try again.');
      } finally {
        setBusyId(null);
      }
    },
    [refetch]
  );

  const onViewAs = useCallback(
    (rider: RiderRecord) => {
      startViewAs(viewAsTargetFromRider(rider));
      router.replace('/(rider)/dashboard');
    },
    [startViewAs, router]
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  if (!roleContext.isAdmin) {
    return <EmptyState emoji="🔒" title="Admins only" />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Button label="Add rider" size="sm" onPress={() => router.push('/(admin)/riders/new')} />
      </View>
      {error && <Text style={styles.error}>{error.message}</Text>}
      <FlatList
        data={riders}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={({ item }) => {
          const presence = data?.presence.get(item.id);
          const status = presence?.status ?? 'offline';
          const palette = PRESENCE_COLORS[status];
          const isBusy = busyId === item.id;
          return (
            <View style={styles.card}>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>
                    {item.phone} · {item.vehicleType} · {item.plateNumber}
                  </Text>
                  {item.ratingCount > 0 && (
                    <Text style={styles.meta}>
                      ⭐ {(item.ratingSum / item.ratingCount).toFixed(1)} ({item.ratingCount})
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge label={status} color={palette.color} backgroundColor={palette.bg} />
                  {presence?.lastLocationUpdate && <Text style={styles.meta}>seen {timeAgo(presence.lastLocationUpdate)}</Text>}
                </View>
              </View>
              <View style={styles.controls}>
                <Button
                  label="View as rider"
                  variant="secondary"
                  size="sm"
                  onPress={() => onViewAs(item)}
                />
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Approved</Text>
                  <Switch
                    value={item.isApproved}
                    disabled={isBusy}
                    onValueChange={(v) => run(item, () => adminRidersApi.setApproved(item.id, v))}
                    trackColor={{ true: colors.primary, false: colors.border }}
                  />
                </View>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Active</Text>
                  <Switch
                    value={item.isActive}
                    disabled={isBusy}
                    onValueChange={(v) => run(item, () => adminRidersApi.setActive(item.id, v))}
                    trackColor={{ true: colors.primary, false: colors.border }}
                  />
                </View>
                {status !== 'offline' && (
                  <Button
                    label="Force offline"
                    variant="danger"
                    size="sm"
                    isLoading={isBusy}
                    onPress={() =>
                      Alert.alert('Force offline?', `${item.name} will stop receiving offers.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Force offline', style: 'destructive', onPress: () => run(item, () => adminRidersApi.forceOffline(item.id)) },
                      ])
                    }
                  />
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={isLoading ? null : <EmptyState emoji="🛵" title="No riders yet" body="Add a rider to start dispatching deliveries." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', gap: spacing.md },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  switchLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  error: { color: colors.danger, marginHorizontal: spacing.lg, fontSize: 13 },
});
