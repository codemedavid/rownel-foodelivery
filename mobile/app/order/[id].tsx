import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius, spacing } from '../../src/theme';

export default function OrderConfirmationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🎉</Text>
      <Text style={styles.title}>Order placed!</Text>
      <Text style={styles.subtitle}>
        We've sent your order to the restaurant. They'll start preparing it shortly.
      </Text>
      <View style={styles.orderIdCard}>
        <Text style={styles.orderIdLabel}>Order reference</Text>
        <Text style={styles.orderIdValue}>{id?.slice(0, 8).toUpperCase()}</Text>
      </View>
      <Text style={styles.hint}>
        Keep your phone nearby — the restaurant may text or call you to confirm.
      </Text>
      <Pressable style={styles.cta} onPress={() => router.dismissTo('/')} accessibilityRole="button">
        <Text style={styles.ctaText}>Back to restaurants</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
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
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 15,
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.xxl,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
