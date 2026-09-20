import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatPeso, radius, shadows, spacing } from '../theme';
import { MerchantWithDistance } from '../lib/merchantDistance';

type Props = {
  merchant: MerchantWithDistance;
  onPress: (merchant: MerchantWithDistance) => void;
  /** Compact layout for the horizontal "Featured" rail. */
  variant?: 'default' | 'compact';
  /** Dish names that matched the active search — shown as why this card is here. */
  matchedDishes?: readonly string[];
};

const PLACEHOLDER = 'https://placehold.co/600x300/ffe8e9/e11d2e?text=🍽';

export function MerchantCard({
  merchant,
  onPress,
  variant = 'default',
  matchedDishes,
}: Props) {
  const isCompact = variant === 'compact';
  const dishHint = matchedDishes?.length ? matchedDishes.join(' · ') : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onPress(merchant)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${merchant.name}`}
    >
      <View>
        <Image
          source={{ uri: merchant.coverImageUrl || merchant.logoUrl || PLACEHOLDER }}
          style={[styles.cover, isCompact && styles.coverCompact]}
          contentFit="cover"
          transition={200}
        />
        {merchant.featured && (
          <View style={styles.featuredBadge}>
            <Ionicons name="star" size={11} color={colors.onPrimary} />
            <Text style={styles.featuredText}>Featured</Text>
          </View>
        )}
        {merchant.estimatedDeliveryTime ? (
          <View style={styles.etaBadge}>
            <Ionicons name="time-outline" size={12} color={colors.text} />
            <Text style={styles.etaText}>{merchant.estimatedDeliveryTime}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {merchant.name}
          </Text>
          <View style={styles.ratingPill}>
            <Ionicons name="star" size={11} color={colors.accentDark} />
            <Text style={styles.ratingText}>{merchant.rating.toFixed(1)}</Text>
          </View>
        </View>

        <Text style={styles.cuisine} numberOfLines={1}>
          {merchant.cuisineType || merchant.category}
        </Text>

        {dishHint ? (
          <View style={styles.dishHint}>
            <Ionicons name="restaurant-outline" size={12} color={colors.primaryDark} />
            <Text style={styles.dishHintText} numberOfLines={1}>
              {dishHint}
            </Text>
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="bicycle-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.metaText}>{formatPeso(merchant.deliveryFee)}</Text>
          </View>
          <View style={styles.metaDot} />
          <View style={styles.metaItem}>
            <Ionicons name="wallet-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.metaText}>Min. {formatPeso(merchant.minimumOrder)}</Text>
          </View>
          {typeof merchant.distanceKm === 'number' && (
            <>
              <View style={styles.metaDot} />
              <View style={styles.metaItem}>
                <Ionicons name="navigate-outline" size={13} color={colors.textSecondary} />
                <Text style={styles.metaText}>{merchant.distanceKm.toFixed(1)} km</Text>
              </View>
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadows.sm,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  cover: { width: '100%', height: 158, backgroundColor: colors.surfaceSunken },
  coverCompact: { height: 130 },
  featuredBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  featuredText: { color: colors.onPrimary, fontSize: 11, fontWeight: '800' },
  etaBadge: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    ...shadows.sm,
  },
  etaText: { fontSize: 12, fontWeight: '800', color: colors.text },
  body: { padding: spacing.lg, paddingTop: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.accentLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  ratingText: { fontSize: 12, fontWeight: '800', color: colors.accentDark },
  cuisine: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 3,
    textTransform: 'capitalize',
  },
  dishHint: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  dishHintText: { fontSize: 12, fontWeight: '700', color: colors.primaryDark },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12.5, color: colors.textSecondary, fontWeight: '600' },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
  },
});
