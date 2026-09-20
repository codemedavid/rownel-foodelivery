import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatPeso, radius, shadows, spacing } from '../theme';
import { MenuItem } from '../types';

type Props = {
  item: MenuItem;
  onPress: (item: MenuItem) => void;
};

const isSoldOut = (item: MenuItem): boolean =>
  item.available === false ||
  (item.trackInventory === true && (item.stockQuantity ?? 0) <= 0);

export function MenuItemRow({ item, onPress }: Props) {
  const soldOut = isSoldOut(item);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed, soldOut && styles.soldOut]}
      onPress={() => onPress(item)}
      disabled={soldOut}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatPeso(item.effectivePrice ?? item.basePrice)}`}
    >
      <View style={styles.info}>
        {(item.popular || item.isOnDiscount) && (
          <View style={styles.badgeRow}>
            {item.popular && (
              <View style={styles.popularBadge}>
                <Ionicons name="flame" size={10} color={colors.accentDark} />
                <Text style={styles.popularText}>Popular</Text>
              </View>
            )}
            {item.isOnDiscount && (
              <View style={styles.discountBadge}>
                <Ionicons name="pricetag" size={10} color={colors.primaryDark} />
                <Text style={styles.discountText}>Sale</Text>
              </View>
            )}
          </View>
        )}

        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        {item.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPeso(item.effectivePrice ?? item.basePrice)}</Text>
          {item.isOnDiscount && (
            <Text style={styles.strikePrice}>{formatPeso(item.basePrice)}</Text>
          )}
          {soldOut && (
            <View style={styles.soldOutPill}>
              <Text style={styles.soldOutText}>Sold out</Text>
            </View>
          )}
        </View>
      </View>

      <View>
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={styles.thumb}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="restaurant-outline" size={24} color={colors.textMuted} />
          </View>
        )}
        {!soldOut && (
          <View style={styles.addButton}>
            <Ionicons name="add" size={18} color={colors.onPrimary} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.lg,
  },
  pressed: { backgroundColor: colors.surfaceSunken },
  soldOut: { opacity: 0.55 },
  info: { flex: 1 },
  badgeRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  popularBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.accentLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  popularText: { fontSize: 10, fontWeight: '800', color: colors.accentDark },
  discountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  discountText: { fontSize: 10, fontWeight: '800', color: colors.primaryDark },
  name: { fontSize: 15.5, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  description: { fontSize: 13, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  price: { fontSize: 15, fontWeight: '800', color: colors.text },
  strikePrice: { fontSize: 13, color: colors.textMuted, textDecorationLine: 'line-through' },
  soldOutPill: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  soldOutText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },
  thumb: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
  },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  addButton: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
    ...shadows.sm,
  },
});
