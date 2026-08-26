import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMerchant } from '../../src/hooks/useMerchants';
import { useMenu } from '../../src/hooks/useMenu';
import { MenuItemRow } from '../../src/components/MenuItemRow';
import { BasketBar } from '../../src/components/BasketBar';
import { colors, formatPeso, radius, spacing } from '../../src/theme';
import { MenuItem } from '../../src/types';

export default function MerchantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { merchant, isLoading: merchantLoading } = useMerchant(id);
  const { menuItems, isLoading: menuLoading, error } = useMenu(id);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<SectionList<MenuItem>>(null);

  const sections = useMemo(() => {
    const byCategory = new Map<string, MenuItem[]>();
    for (const item of menuItems) {
      const list = byCategory.get(item.category) ?? [];
      byCategory.set(item.category, [...list, item]);
    }
    return [...byCategory.entries()].map(([title, data]) => ({ title, data }));
  }, [menuItems]);

  const openItem = (item: MenuItem) =>
    router.push({ pathname: '/item/[id]', params: { id: item.id, merchantId: id } });

  const jumpToCategory = (title: string, index: number) => {
    setActiveCategory(title);
    listRef.current?.scrollToLocation({ sectionIndex: index, itemIndex: 0, viewOffset: 60 });
  };

  if (merchantLoading || (menuLoading && menuItems.length === 0)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!merchant) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Restaurant not found.'}</Text>
      </View>
    );
  }

  const renderHeader = () => (
    <View>
      <View>
        <Image
          source={{
            uri:
              merchant.coverImageUrl ||
              merchant.logoUrl ||
              'https://placehold.co/800x400/fee2e2/dc2626?text=🍽',
          }}
          style={styles.cover}
          contentFit="cover"
        />
        <Pressable
          style={[styles.backButton, { top: insets.top + spacing.sm }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.name}>{merchant.name}</Text>
        {merchant.cuisineType ? (
          <Text style={styles.cuisine}>{merchant.cuisineType}</Text>
        ) : null}
        <View style={styles.statsRow}>
          <Text style={styles.stat}>★ {merchant.rating.toFixed(1)}</Text>
          <Text style={styles.statDivider}>·</Text>
          {merchant.estimatedDeliveryTime ? (
            <>
              <Text style={styles.stat}>{merchant.estimatedDeliveryTime}</Text>
              <Text style={styles.statDivider}>·</Text>
            </>
          ) : null}
          <Text style={styles.stat}>{formatPeso(merchant.deliveryFee)} delivery</Text>
        </View>
        <Text style={styles.minOrder}>Minimum order {formatPeso(merchant.minimumOrder)}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {sections.map((section, index) => {
          const isActive = activeCategory === section.title;
          return (
            <Pressable
              key={section.title}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => jumpToCategory(section.title, index)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {section.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.container}>
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MenuItemRow item={item} onPress={openItem} />}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {error ? `Couldn't load the menu: ${error}` : 'No menu items yet.'}
          </Text>
        }
        contentContainerStyle={{ paddingBottom: 120 }}
        stickySectionHeadersEnabled={false}
        onScrollToIndexFailed={() => undefined}
      />
      <BasketBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.textSecondary, padding: spacing.xl, textAlign: 'center' },
  cover: { width: '100%', height: 200 },
  backButton: {
    position: 'absolute',
    left: spacing.lg,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  backIcon: { fontSize: 18, fontWeight: '700', color: colors.text },
  infoCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: -32,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  name: { fontSize: 22, fontWeight: '800', color: colors.text },
  cuisine: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  stat: { fontSize: 13, fontWeight: '600', color: colors.text },
  statDivider: { marginHorizontal: spacing.sm, color: colors.textMuted },
  minOrder: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  chipsRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.text, textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  sectionHeader: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    textTransform: 'capitalize',
  },
  emptyText: { textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xxl },
});
