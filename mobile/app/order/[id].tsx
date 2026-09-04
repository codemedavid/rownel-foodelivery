import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { isTerminalStatus } from '../../src/lib/orderStatus';
import { useOrderRealtime } from '../../src/hooks/useOrderRealtime';
import type { OrderUpdatePayload } from '../../src/lib/notificationMessages';
import { colors, radius, spacing } from '../../src/theme';

const POLL_INTERVAL_MS = 15_000;
/** Once the realtime socket is live the poll is only a safety net. */
const RELAXED_POLL_INTERVAL_MS = 60_000;

const STATUS_STEPS = [
  { key: 'pending', label: 'Order placed', emoji: '🧾' },
  { key: 'confirmed', label: 'Confirmed', emoji: '✅' },
  { key: 'preparing', label: 'Preparing', emoji: '🍳' },
  { key: 'ready', label: 'Ready', emoji: '📦' },
  { key: 'out_for_delivery', label: 'Out for delivery', emoji: '🛵' },
  { key: 'completed', label: 'Completed', emoji: '🎉' },
] as const;

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
  const currentIndex = STATUS_STEPS.findIndex((step) => step.key === status);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.emoji}>{isCancelled ? '❌' : '🎉'}</Text>
      <Text style={styles.title}>{isCancelled ? 'Order cancelled' : 'Order placed!'}</Text>
      <Text style={styles.subtitle}>
        {isCancelled
          ? 'This order has been cancelled. Contact the merchant if this is unexpected.'
          : "We'll update this screen — and notify you — as the restaurant works on your order."}
      </Text>

      <View style={styles.orderIdCard}>
        <Text style={styles.orderIdLabel}>Order reference</Text>
        <Text style={styles.orderIdValue}>{id?.slice(0, 8).toUpperCase()}</Text>
      </View>

      {!!riderName && !isCancelled && (
        <View style={styles.riderCard}>
          <Text style={styles.riderLabel}>Your rider</Text>
          <Text style={styles.riderValue}>🛵 {riderName}</Text>
        </View>
      )}

      {!isCancelled && (
        <View style={styles.timeline}>
          {STATUS_STEPS.map((step, index) => {
            const reached = currentIndex >= 0 && index <= currentIndex;
            return (
              <View key={step.key} style={styles.stepRow}>
                <Text style={[styles.stepEmoji, !reached && styles.stepPending]}>{step.emoji}</Text>
                <Text style={[styles.stepLabel, reached ? styles.stepReached : styles.stepPending]}>
                  {step.label}
                </Text>
                {index === currentIndex && !isTerminalStatus(step.key) && (
                  <View style={styles.nowBadge}>
                    <Text style={styles.nowBadgeText}>Now</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      <Pressable style={styles.cta} onPress={() => router.dismissTo('/')} accessibilityRole="button">
        <Text style={styles.ctaText}>Back to restaurants</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { alignItems: 'center', padding: spacing.xl },
  emoji: { fontSize: 56 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: spacing.lg },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  orderIdCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  orderIdLabel: { fontSize: 12, color: colors.textMuted },
  orderIdValue: { fontSize: 22, fontWeight: '800', color: colors.primary, marginTop: 2 },
  riderCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.accentLight,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  riderLabel: { fontSize: 12, color: colors.textSecondary },
  riderValue: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 2 },
  timeline: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepEmoji: { fontSize: 18 },
  stepLabel: { fontSize: 15, fontWeight: '600' },
  stepReached: { color: colors.text },
  stepPending: { color: colors.textMuted, opacity: 0.5 },
  nowBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  nowBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 15,
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.xl,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
