import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useRiderEarnings } from '../../src/hooks/useRiderEarnings';
import { timeAgo } from '../../src/lib/formatters';
import { colors, formatPeso, radius, spacing } from '../../src/theme';
import { Badge, EmptyState, StatCard } from '../../src/components/ui';

const PAYOUT_COLORS = {
  paid: { color: colors.success, bg: '#dcfce7' },
  pending: { color: '#b45309', bg: '#fef3c7' },
  cancelled: { color: colors.danger, bg: colors.primaryLight },
} as const;

export default function RiderEarningsScreen() {
  const { user } = useAuth();
  const { summary, payouts, isLoading, error, refetch } = useRiderEarnings(user?.id);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  return (
    <FlatList
      style={styles.screen}
      data={payouts}
      keyExtractor={(payout) => payout.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          {!!error && <Text style={styles.error}>{error.message}</Text>}
          <View style={styles.stats}>
            <StatCard
              label="Today"
              value={formatPeso(summary?.todayEarnings ?? 0)}
              hint={`${summary?.todayCount ?? 0} deliveries`}
            />
            <StatCard
              label="Unpaid"
              value={formatPeso(summary?.unpaidEarnings ?? 0)}
              hint="Not yet paid out"
            />
          </View>
          <View style={styles.stats}>
            <StatCard
              label="Total earned"
              value={formatPeso(summary?.totalEarned ?? 0)}
              hint={`${summary?.completedCount ?? 0} completed`}
            />
            <StatCard label="Paid out" value={formatPeso(summary?.totalPaid ?? 0)} />
          </View>
          <Text style={styles.sectionTitle}>Payouts</Text>
        </View>
      }
      renderItem={({ item }) => {
        const palette = PAYOUT_COLORS[item.status];
        return (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.amount}>{formatPeso(item.amount)}</Text>
              <Badge label={item.status} color={palette.color} backgroundColor={palette.bg} />
            </View>
            <Text style={styles.meta}>
              {item.paidAt ? `Paid ${timeAgo(item.paidAt)}` : `Created ${timeAgo(item.createdAt)}`}
            </Text>
            {!!item.notes && <Text style={styles.meta}>{item.notes}</Text>}
          </View>
        );
      }}
      ListEmptyComponent={
        isLoading ? null : (
          <EmptyState emoji="💸" title="No payouts yet" body="Payouts appear here once an admin releases them." />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  stats: { flexDirection: 'row', gap: spacing.sm },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.sm,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: 4 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  amount: { fontSize: 16, fontWeight: '800', color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary },
  error: { color: colors.danger, fontSize: 13 },
});
