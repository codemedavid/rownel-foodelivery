import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, formatPeso, radius, shadows, spacing } from '../theme';
import { useCart } from '../context/CartContext';

export function BasketBar() {
  const { itemCount, subtotal, merchantIds } = useCart();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (itemCount === 0) return null;

  const caption =
    merchantIds.length > 1
      ? `${itemCount} items · ${merchantIds.length} restaurants`
      : `${itemCount} ${itemCount === 1 ? 'item' : 'items'} in your basket`;

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <Pressable
        style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
        onPress={() => router.push('/cart')}
        accessibilityRole="button"
        accessibilityLabel={`View basket, ${itemCount} items, ${formatPeso(subtotal)}`}
      >
        <View style={styles.countPill}>
          <Ionicons name="basket" size={16} color={colors.onPrimary} />
          <Text style={styles.countText}>{itemCount}</Text>
        </View>

        <View style={styles.labels}>
          <Text style={styles.label}>View basket</Text>
          <Text style={styles.caption} numberOfLines={1}>
            {caption}
          </Text>
        </View>

        <Text style={styles.total}>{formatPeso(subtotal)}</Text>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.9)" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    ...shadows.lg,
  },
  pressed: { backgroundColor: colors.primaryDark, transform: [{ scale: 0.99 }] },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  countText: { color: colors.onPrimary, fontWeight: '800', fontSize: 14 },
  labels: { flex: 1 },
  label: { color: colors.onPrimary, fontWeight: '800', fontSize: 15.5 },
  caption: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1 },
  total: { color: colors.onPrimary, fontWeight: '800', fontSize: 16 },
});
