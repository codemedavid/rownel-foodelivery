import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors, formatPeso, radius, spacing } from '../theme';
import { Merchant } from '../types';

type Props = {
  merchant: Merchant;
  onPress: (merchant: Merchant) => void;
};

const PLACEHOLDER = 'https://placehold.co/600x300/fee2e2/dc2626?text=🍽';

export function MerchantCard({ merchant, onPress }: Props) {
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
          style={styles.cover}
          contentFit="cover"
          transition={200}
        />
        {merchant.featured && (
          <View style={styles.featuredBadge}>
            <Text style={styles.featuredText}>Featured</Text>
          </View>
        )}
        {merchant.estimatedDeliveryTime ? (
          <View style={styles.etaBadge}>
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
            <Text style={styles.ratingText}>★ {merchant.rating.toFixed(1)}</Text>
          </View>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {merchant.cuisineType || merchant.category}
        </Text>
        <Text style={styles.meta}>
          {formatPeso(merchant.deliveryFee)} delivery · Min. {formatPeso(merchant.minimumOrder)}
        </Text>
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
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pressed: { opacity: 0.85 },
  cover: { width: '100%', height: 150 },
  featuredBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  featuredText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  etaBadge: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  etaText: { fontSize: 12, fontWeight: '700', color: colors.text },
  body: { padding: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1, marginRight: spacing.sm },
  ratingPill: {
    backgroundColor: colors.accentLight,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ratingText: { fontSize: 12, fontWeight: '700', color: '#92400e' },
  meta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
});
