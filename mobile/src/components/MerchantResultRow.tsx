import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatPeso, radius, spacing } from '../theme';
import { MerchantWithDistance } from '../lib/merchantDistance';

type Props = {
  merchant: MerchantWithDistance;
  onPress: (merchant: MerchantWithDistance) => void;
  /** Dish names that matched the active search — shown as why this row is here. */
  matchedDishes?: readonly string[];
};

const PLACEHOLDER = 'https://placehold.co/200x200/ffe8e9/e11d2e?text=🍽';

/** Dense one-line result row — search shows many places at once, not one card per screen. */
export function MerchantResultRow({ merchant, onPress, matchedDishes }: Props) {
  const dishHint = matchedDishes?.length ? matchedDishes.join(' · ') : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => onPress(merchant)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${merchant.name}`}
    >
      <Image
        source={{ uri: merchant.logoUrl || merchant.coverImageUrl || PLACEHOLDER }}
        style={styles.thumb}
        contentFit="cover"
        transition={150}
      />

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {merchant.name}
        </Text>
        <Text style={styles.cuisine} numberOfLines={1}>
          {merchant.cuisineType || merchant.category}
        </Text>

        {dishHint ? (
          <Text style={styles.dishHint} numberOfLines={1}>
            <Ionicons name="restaurant-outline" size={11} color={colors.primaryDark} /> {dishHint}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          <Ionicons name="star" size={11} color={colors.accentDark} />
          <Text style={styles.metaText}>{merchant.rating.toFixed(1)}</Text>
          <View style={styles.metaDot} />
          <Text style={styles.metaText}>{formatPeso(merchant.deliveryFee)} delivery</Text>
          {typeof merchant.distanceKm === 'number' && (
            <>
              <View style={styles.metaDot} />
              <Text style={styles.metaText}>{merchant.distanceKm.toFixed(1)} km</Text>
            </>
          )}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.9 },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
  },
  body: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  cuisine: { fontSize: 12.5, color: colors.textSecondary, marginTop: 1, textTransform: 'capitalize' },
  dishHint: { fontSize: 12, fontWeight: '700', color: colors.primaryDark, marginTop: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  metaText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textMuted },
});
