import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useMerchants } from '../../src/hooks/useMerchants';
import { useSalesSummary } from '../../src/hooks/useSalesSummary';
import { dateRangePreset, type DateRangePreset } from '../../src/lib/analytics';
import { ORDER_STATUSES } from '../../src/lib/adminTypes';
import { statusStyle } from '../../src/lib/statusColors';
import { serviceTypeLabel } from '../../src/lib/formatters';
import { colors, formatPeso, radius, spacing } from '../../src/theme';
import { Badge, EmptyState, SegmentedControl, StatCard, type Segment } from '../../src/components/ui';
import { DailyBars } from '../../src/components/admin/DailyBars';

const PRESETS: Segment<DateRangePreset>[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];
const ALL_MERCHANTS = '__all__';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function AnalyticsScreen() {
  const { roleContext } = useAuth();
  const { merchants } = useMerchants();
  const [preset, setPreset] = useState<DateRangePreset>('7d');
  const [merchantId, setMerchantId] = useState<string>(ALL_MERCHANTS);

  const range = useMemo(() => dateRangePreset(preset, new Date()), [preset]);
  const selectedMerchant = merchantId === ALL_MERCHANTS ? null : merchantId;
  const { data, isLoading, error, refetch } = useSalesSummary(range, selectedMerchant, roleContext.isAdmin);

  const merchantSegments: Segment<string>[] = [
    { value: ALL_MERCHANTS, label: 'All merchants' },
    ...merchants.map((m) => ({ value: m.id, label: m.name })),
  ];

  if (!roleContext.isAdmin) {
    return <EmptyState emoji="🔒" title="Admins only" body="Sales analytics are limited to admin accounts." />;
  }

  const totals = data?.totals;
  const completionRate = totals && totals.orderCount > 0 ? Math.round((totals.completedCount / totals.orderCount) * 100) : 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <SegmentedControl segments={PRESETS} value={preset} onChange={setPreset} />
      {merchants.length > 1 && (
        <SegmentedControl segments={merchantSegments} value={merchantId} onChange={setMerchantId} />
      )}
      {error && (
        <Text style={styles.error} onPress={() => refetch()}>
          {error.message} · tap to retry
        </Text>
      )}
      {isLoading && !data ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : data && totals ? (
        <>
          <View style={styles.statGrid}>
            <StatCard label="Sales (completed)" value={formatPeso(totals.grossSales)} />
            <StatCard label="Orders" value={String(totals.orderCount)} hint={`${completionRate}% completed`} />
            <StatCard label="Avg order" value={formatPeso(totals.avgOrderValue)} />
            <StatCard label="Delivery fees" value={formatPeso(totals.deliveryFees)} hint={`${totals.cancelledCount} cancelled`} />
          </View>

          <Card title="Daily sales">
            <DailyBars points={data.daily} />
          </Card>

          <Card title="By status">
            <View style={styles.wrap}>
              {ORDER_STATUSES.filter((s) => (data.countsByStatus[s] ?? 0) > 0).map((s) => {
                const style = statusStyle(s);
                return (
                  <Badge
                    key={s}
                    label={`${style.label} ${data.countsByStatus[s]}`}
                    color={style.color}
                    backgroundColor={style.background}
                  />
                );
              })}
            </View>
          </Card>

          <Card title="By service type">
            {Object.entries(data.byServiceType).map(([type, entry]) => (
              <View key={type} style={styles.line}>
                <Text style={styles.lineLabel}>{serviceTypeLabel(type)}</Text>
                <Text style={styles.lineValue}>
                  {entry.count} · {formatPeso(entry.sales)}
                </Text>
              </View>
            ))}
          </Card>

          <Card title="Top items">
            {data.topItems.length === 0 && <Text style={styles.muted}>No completed orders in range.</Text>}
            {data.topItems.map((item, index) => (
              <View key={item.itemId} style={styles.line}>
                <Text style={styles.lineLabel} numberOfLines={1}>
                  {index + 1}. {item.name}
                </Text>
                <Text style={styles.lineValue}>
                  {item.quantity} · {formatPeso(item.sales)}
                </Text>
              </View>
            ))}
          </Card>

          {selectedMerchant === null && data.topMerchants.length > 0 && (
            <Card title="Top merchants">
              {data.topMerchants.map((m, index) => (
                <View key={m.merchantId} style={styles.line}>
                  <Text style={styles.lineLabel} numberOfLines={1}>
                    {index + 1}. {m.name}
                  </Text>
                  <Text style={styles.lineValue}>
                    {m.orders} · {formatPeso(m.sales)}
                  </Text>
                </View>
              ))}
            </Card>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { paddingBottom: spacing.xxl, gap: spacing.md },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg },
  card: { marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  lineLabel: { flex: 1, fontSize: 14, color: colors.text },
  lineValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  error: { color: colors.danger, marginHorizontal: spacing.lg, fontSize: 13 },
});
