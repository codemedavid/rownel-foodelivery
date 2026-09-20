import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { isTerminalStatus } from '../../src/lib/orderStatus';
import {
  CUSTOMER_STATUS_FLOW,
  describeOrderStatus,
  getStatusStepIndex,
} from '../../src/lib/orderStatusDisplay';
import { useOrderRealtime } from '../../src/hooks/useOrderRealtime';
import type { OrderUpdatePayload } from '../../src/lib/notificationMessages';
import { Button } from '../../src/components/ui';
import { colors, radius, shadows, spacing } from '../../src/theme';

const POLL_INTERVAL_MS = 15_000;
/** Once the realtime socket is live the poll is only a safety net. */
const RELAXED_POLL_INTERVAL_MS = 60_000;

export default function OrderStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [riderName, setRiderName] = useState<string | null>(null);

  const onRealtimeUpdate = useCallback((payload: OrderUpdatePayload) => {
    setStatus(payload.status);
    setRiderName(payload.riderName);
  }, []);
  const { isSubscribed } = useOrderRealtime(id, onRealtimeUpdate);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const { data, error } = await supabase.rpc('get_order_public', { p_order_id: id });
        if (cancelled || error || !data) return;
        const row = data as { status?: string; rider_name?: string | null };
        if (row.status) setStatus(row.status);
        if (row.rider_name !== undefined) setRiderName(row.rider_name ?? null);
      } catch {
        // Keep showing the last known status; the next poll retries.
      }
    };

    fetchStatus();
    const intervalId = setInterval(
      fetchStatus,
      isSubscribed ? RELAXED_POLL_INTERVAL_MS : POLL_INTERVAL_MS
    );
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [id, isSubscribed]);

  const isCancelled = status === 'cancelled';
  const currentIndex = getStatusStepIndex(status);
  const current = describeOrderStatus(status);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={[styles.headline, { backgroundColor: current.background }]}>
        <View style={[styles.headlineIcon, { backgroundColor: colors.surface }]}>
          <Ionicons name={current.icon} size={28} color={current.color} />
        </View>
        <Text style={[styles.headlineStatus, { color: current.color }]}>{current.label}</Text>
        <Text style={styles.headlineBody}>
          {isCancelled
            ? 'This order has been cancelled. Contact the merchant if this is unexpected.'
            : "We'll update this screen — and notify you — as your order moves along."}
        </Text>
        <View style={styles.liveRow}>
          <View style={[styles.liveDot, { backgroundColor: isSubscribed ? colors.success : colors.textMuted }]} />
          <Text style={styles.liveText}>{isSubscribed ? 'Live updates on' : 'Checking for updates…'}</Text>
        </View>
      </View>

      <View style={styles.referenceCard}>
        <View>
          <Text style={styles.referenceLabel}>Order reference</Text>
          <Text style={styles.referenceValue}>{id?.slice(0, 8).toUpperCase()}</Text>
        </View>
        <Ionicons name="qr-code-outline" size={28} color={colors.textMuted} />
      </View>

      {!!riderName && !isCancelled && (
        <View style={styles.riderCard}>
          <View style={styles.riderIcon}>
            <Ionicons name="bicycle" size={20} color={colors.onPrimary} />
          </View>
          <View style={styles.riderText}>
            <Text style={styles.riderLabel}>Your rider</Text>
            <Text style={styles.riderValue}>{riderName}</Text>
          </View>
        </View>
      )}

      {!isCancelled && (
        <View style={styles.timeline}>
          {CUSTOMER_STATUS_FLOW.map((step, index) => {
            const presentation = describeOrderStatus(step);
            const isReached = currentIndex >= 0 && index <= currentIndex;
            const isCurrent = index === currentIndex;
            const isLast = index === CUSTOMER_STATUS_FLOW.length - 1;

            return (
              <View key={step} style={styles.stepRow}>
                <View style={styles.stepRail}>
                  <View
                    style={[
                      styles.stepDot,
                      isReached && { backgroundColor: presentation.color, borderColor: presentation.color },
                    ]}
                  >
                    {isReached && (
                      <Ionicons name="checkmark" size={12} color={colors.onPrimary} />
                    )}
                  </View>
                  {!isLast && (
                    <View
                      style={[styles.stepLine, isReached && { backgroundColor: presentation.color }]}
                    />
                  )}
                </View>

                <View style={styles.stepBody}>
                  <Text style={[styles.stepLabel, !isReached && styles.stepLabelPending]}>
                    {presentation.label}
                  </Text>
                  {isCurrent && !isTerminalStatus(step) && (
                    <View style={[styles.nowBadge, { backgroundColor: presentation.background }]}>
                      <Text style={[styles.nowBadgeText, { color: presentation.color }]}>
                        Happening now
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Button
        label="Back to restaurants"
        onPress={() => router.dismissTo('/')}
        variant="secondary"
        size="lg"
        style={styles.cta}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },

  headline: {
    alignItems: 'center',
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  headlineIcon: {
    width: 62,
    height: 62,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  headlineStatus: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: spacing.md,
    letterSpacing: -0.4,
  },
  headlineBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  liveDot: { width: 7, height: 7, borderRadius: radius.full },
  liveText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },

  referenceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
    ...shadows.sm,
  },
  referenceLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '700' },
  referenceValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 1,
    marginTop: 2,
  },

  riderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
    ...shadows.sm,
  },
  riderIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderText: { flex: 1 },
  riderLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '700' },
  riderValue: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 1 },

  timeline: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
    ...shadows.sm,
  },
  stepRow: { flexDirection: 'row', gap: spacing.md },
  stepRail: { alignItems: 'center', width: 24 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  stepBody: { flex: 1, paddingBottom: spacing.lg },
  stepLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  stepLabelPending: { color: colors.textMuted },
  nowBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    marginTop: spacing.xs,
  },
  nowBadgeText: { fontSize: 11, fontWeight: '800' },

  cta: { marginTop: spacing.lg },
});
