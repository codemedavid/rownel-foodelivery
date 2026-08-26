import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors, formatPeso, radius, spacing } from '../theme';
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
        <View style={styles.badgeRow}>
          {item.popular && (
            <View style={styles.popularBadge}>
              <Text style={styles.popularText}>Popular</Text>
            </View>
          )}
          {item.isOnDiscount && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>Sale</Text>
            </View>
          )}
        </View>
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
          {soldOut && <Text style={styles.soldOutText}>Sold out</Text>}
        </View>
      </View>
      {item.image ? (
        <View>
          <Image source={{ uri: item.image }} style={styles.thumb} contentFit="cover" transition={150} />
          {!soldOut && (
            <View style={styles.addButton}>
              <Text style={styles.addButtonText}>+</Text>
            </View>
          )}
        </View>
      ) : (
        !soldOut && (
          <View style={[styles.addButton, styles.addButtonInline]}>
            <Text style={styles.addButtonText}>+</Text>
          </View>
        )
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  pressed: { backgroundColor: '#fafafa' },
  soldOut: { opacity: 0.5 },
  info: { flex: 1 },
  badgeRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: 2 },
  popularBadge: {
    backgroundColor: colors.accentLight,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  popularText: { fontSize: 10, fontWeight: '700', color: '#92400e' },
  discountBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  discountText: { fontSize: 10, fontWeight: '700', color: colors.primaryDark },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  description: { fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  price: { fontSize: 15, fontWeight: '700', color: colors.primary },
  strikePrice: {
    fontSize: 13,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  soldOutText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  thumb: { width: 88, height: 88, borderRadius: radius.md },
  addButton: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  addButtonInline: { position: 'relative', bottom: 0, right: 0, alignSelf: 'center' },
  addButtonText: { fontSize: 20, fontWeight: '700', color: colors.primary, lineHeight: 22 },
});
