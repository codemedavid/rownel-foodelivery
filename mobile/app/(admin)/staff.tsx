import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { useMerchants } from '../../src/hooks/useMerchants';
import { adminStaffApi } from '../../src/lib/adminStaffApi';
import type { StaffRecord } from '../../src/lib/adminTypes';
import { colors, spacing } from '../../src/theme';
import { Button, EmptyState } from '../../src/components/ui';
import { StaffRow } from '../../src/components/admin/StaffRow';

export default function StaffScreen() {
  const router = useRouter();
  const { roleContext } = useAuth();
  const { merchants } = useMerchants();
  const fetcher = useCallback(() => adminStaffApi.list(), []);
  const { data, isLoading, error, refetch } = useLiveQuery(fetcher, [], {
    enabled: roleContext.isAdmin,
    realtime: [{ table: 'staff' }],
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const merchantNames = useMemo(() => new Map(merchants.map((m) => [m.id, m.name])), [merchants]);

  const toggleActive = useCallback(
    async (staff: StaffRecord, isActive: boolean) => {
      setBusyId(staff.id);
      try {
        await adminStaffApi.setActive(staff.id, isActive);
        await refetch();
      } catch (err) {
        Alert.alert('Update failed', err instanceof Error ? err.message : 'Please try again.');
      } finally {
        setBusyId(null);
      }
    },
    [refetch]
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
        <Button label="Add staff" size="sm" onPress={() => router.push('/(admin)/staff/new')} />
      </View>
      {error && <Text style={styles.error}>{error.message}</Text>}
      <FlatList
        data={data ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <StaffRow staff={item} merchantNames={merchantNames} isBusy={busyId === item.id} onToggleActive={toggleActive} />
        )}
        ListEmptyComponent={isLoading ? null : <EmptyState emoji="👥" title="No staff yet" body="Add your first staff account." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  error: { color: colors.danger, marginHorizontal: spacing.lg, fontSize: 13 },
});
