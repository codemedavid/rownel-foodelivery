import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, formatPeso, radius, spacing } from '../theme';
import { useCart } from '../context/CartContext';

export function BasketBar() {
  const { itemCount, subtotal } = useCart();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (itemCount === 0) return null;

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <Pressable
        style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
        onPress={() => router.push('/cart')}
        accessibilityRole="button"
        accessibilityLabel={`View basket, ${itemCount} items, ${formatPeso(subtotal)}`}
      >
        <View style={styles.countPill}>
          <Text style={styles.countText}>{itemCount}</Text>
        </View>
        <Text style={styles.label}>View basket</Text>
        <Text style={styles.total}>{formatPeso(subtotal)}</Text>
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
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  pressed: { backgroundColor: colors.primaryDark },
  countPill: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: radius.sm,
    minWidth: 26,
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  countText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  label: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: spacing.md },
  total: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
